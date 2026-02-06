const path = require('path');
const { ensureGroupForUser, linkUserToGroupByEmail } = require('../models/financeGroupModel');
const { listCategories, createCategory } = require('../models/financeCategoryModel');
const { listBudgets, upsertBudget } = require('../models/financeBudgetModel');
const {
  createTransaction,
  listRecentTransactions,
  getMonthlySummary,
  getExpenseByCategory,
  getMonthlySeries,
} = require('../models/financeTransactionModel');
const { createDocument, getDocumentById } = require('../models/financeDocumentModel');

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function monthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthEnd(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function normalizeMonthInput(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 10);
  return null;
}

async function withGroup(req) {
  const groupId = await ensureGroupForUser(req.user);
  if (!req.session.simUser.finance_group_id) {
    req.session.simUser.finance_group_id = groupId;
    req.user.finance_group_id = groupId;
  }
  return groupId;
}

function buildMessages(query) {
  const noticeMap = {
    category: 'Categoria criada com sucesso.',
    budget: 'Budget guardado.',
    transaction: 'Movimento guardado.',
    shared: 'Financas partilhadas com sucesso.',
  };
  const errorMap = {
    'missing-category': 'Preenche o nome da categoria.',
    'missing-budget': 'Preenche todos os campos do budget.',
    'missing-transaction': 'Preenche tipo, valor e data.',
    'missing-share': 'Indica o email para partilhar.',
    'share-missing': 'O utilizador nao existe.',
    'share-self': 'Nao podes partilhar contigo proprio.',
  };
  return {
    notice: query.notice ? (noticeMap[query.notice] || query.notice) : null,
    error: query.error ? (errorMap[query.error] || query.error) : null,
  };
}

async function renderDashboard(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const now = new Date();
    const start = monthStart(now);
    const end = monthEnd(now);

    const [summary, byCategory] = await Promise.all([
      getMonthlySummary(groupId, formatDate(start), formatDate(end)),
      getExpenseByCategory(groupId, formatDate(start), formatDate(end)),
    ]);

    const seriesStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const seriesRows = await getMonthlySeries(groupId, formatDate(seriesStart), formatDate(end));
    const seriesMap = new Map(seriesRows.map(row => [row.mes, row]));
    const series = [];
    for (let i = 0; i < 6; i += 1) {
      const d = new Date(seriesStart.getFullYear(), seriesStart.getMonth() + i, 1);
      const key = formatDate(d);
      const row = seriesMap.get(key) || { total_income: 0, total_expense: 0 };
      series.push({
        mes: key,
        total_income: Number(row.total_income || 0),
        total_expense: Number(row.total_expense || 0),
      });
    }

    res.render('dashboard', {
      title: 'Dashboard',
      user: req.user,
      active: 'dashboard',
      summary: {
        income: Number(summary.total_income || 0),
        expense: Number(summary.total_expense || 0),
      },
      byCategory,
      series,
      ...buildMessages(req.query),
    });
  } catch (err) {
    return next(err);
  }
}

async function renderTransactions(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const [categories, recent] = await Promise.all([
      listCategories(groupId),
      listRecentTransactions(groupId, 30),
    ]);
    res.render('transactions', {
      title: 'Movimentos',
      user: req.user,
      active: 'transactions',
      categories,
      recent,
      ...buildMessages(req.query),
    });
  } catch (err) {
    return next(err);
  }
}

async function renderCategories(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const categories = await listCategories(groupId);
    res.render('categories', {
      title: 'Categorias',
      user: req.user,
      active: 'categories',
      categories,
      ...buildMessages(req.query),
    });
  } catch (err) {
    return next(err);
  }
}

async function renderBudgets(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const [categories, budgets] = await Promise.all([
      listCategories(groupId),
      listBudgets(groupId),
    ]);
    res.render('budgets', {
      title: 'Budgets',
      user: req.user,
      active: 'budgets',
      categories,
      budgets,
      ...buildMessages(req.query),
    });
  } catch (err) {
    return next(err);
  }
}

async function renderShare(req, res, next) {
  try {
    await withGroup(req);
    res.render('share', {
      title: 'Partilhar',
      user: req.user,
      active: 'share',
      ...buildMessages(req.query),
    });
  } catch (err) {
    return next(err);
  }
}

async function handleCreateCategory(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { name, type } = req.body;
    if (!name) return res.redirect('/categories?error=missing-category');
    const safeType = type === 'income' ? 'income' : 'expense';
    await createCategory({ groupId, name: name.trim(), type: safeType });
    return res.redirect('/categories?notice=category');
  } catch (err) {
    return next(err);
  }
}

async function handleCreateBudget(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { category_id, month, amount } = req.body;
    const normalizedMonth = normalizeMonthInput(month);
    if (!category_id || !normalizedMonth || !amount) {
      return res.redirect('/budgets?error=missing-budget');
    }
    await upsertBudget({
      groupId,
      categoryId: Number(category_id),
      month: normalizedMonth,
      amount: Number(amount),
    });
    return res.redirect('/budgets?notice=budget');
  } catch (err) {
    return next(err);
  }
}

async function handleCreateTransaction(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { type, amount, date, description, source, category_id } = req.body;
    if (!type || !amount || !date) {
      return res.redirect('/transactions?error=missing-transaction');
    }
    const safeType = type === 'income' ? 'income' : 'expense';
    const transactionId = await createTransaction({
      groupId,
      userId: req.user.id,
      type: safeType,
      categoryId: category_id ? Number(category_id) : null,
      amount: Number(amount),
      occurredOn: date,
      description: description ? description.trim() : null,
      source: source ? source.trim() : null,
    });

    if (req.file) {
      await createDocument({
        groupId,
        transactionId,
        userId: req.user.id,
        originalName: req.file.originalname,
        filePath: req.file.filename,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
      });
    }

    return res.redirect('/transactions?notice=transaction');
  } catch (err) {
    return next(err);
  }
}

async function handleShare(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email) return res.redirect('/share?error=missing-share');
    const result = await linkUserToGroupByEmail({
      ownerUserId: req.user.id,
      ownerGroupId: groupId,
      email,
    });
    if (!result.ok) {
      return res.redirect(`/share?error=share-${result.reason}`);
    }
    return res.redirect('/share?notice=shared');
  } catch (err) {
    return next(err);
  }
}

async function handleDownloadDocument(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const docId = Number(req.params.id);
    if (!docId) return res.redirect('/dashboard');
    const doc = await getDocumentById(docId);
    if (!doc || Number(doc.finance_group_id) !== Number(groupId)) {
      return res.redirect('/login');
    }
    const filePath = path.join(__dirname, '..', 'private_uploads', doc.file_path);
    return res.sendFile(filePath);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  renderDashboard,
  renderTransactions,
  renderCategories,
  renderBudgets,
  renderShare,
  handleCreateCategory,
  handleCreateBudget,
  handleCreateTransaction,
  handleShare,
  handleDownloadDocument,
};

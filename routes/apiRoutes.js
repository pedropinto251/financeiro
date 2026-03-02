const express = require('express');
const jwt = require('jsonwebtoken');
const { getSimUserByEmail, validateSimPassword } = require('../models/simulatorUserModel');
const { ensureGroupForUser, linkUserToGroupByEmail } = require('../models/financeGroupModel');
const { apiAuth } = require('../middleware/apiAuth');
const upload = require('../config/upload');
const path = require('path');
const { listCategories, createCategory, updateCategory, deleteCategory } = require('../models/financeCategoryModel');
const { listBudgets, upsertBudget, updateBudget, deleteBudget } = require('../models/financeBudgetModel');
const {
  listTransactions,
  countTransactions,
  createTransaction,
  getMonthlySummary,
  getYearSummary,
  getExpenseByCategory,
  getTotalSummary,
  updateTransaction,
  deleteTransaction,
  voidTransaction,
} = require('../models/financeTransactionModel');
const {
  listGoals,
  getTotalAllocated,
  getMonthlyAllocated,
  createGoal,
  updateGoal,
  deleteGoal,
  addAllocation,
  listAllocations,
  getAllocationById,
  updateAllocation,
  deleteAllocation,
  getGoalAllocatedTotal,
  updateGoalStatus,
  getGoalById,
} = require('../models/goalModel');
const {
  createDocument,
  getDocumentById,
  deleteDocumentsByTransaction,
  listDocumentsByTransaction,
} = require('../models/financeDocumentModel');
const { normalizeUploadedDocument } = require('../services/documentUpload');
const { clampCycleDay, getCyclePeriod } = require('../services/financePeriod');

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getUserCycleSettings(user) {
  const cycleDay = clampCycleDay(
    user?.cycle_day ?? user?.ciclo_dia ?? 1
  );
  const adjustWeekendRaw = user?.cycle_next_business_day ?? user?.ciclo_proximo_util;
  const adjustWeekend = adjustWeekendRaw === true || adjustWeekendRaw === 1 || adjustWeekendRaw === '1';
  return { cycleDay, adjustWeekend };
}

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'missing' });
    const user = await getSimUserByEmail(String(email).trim().toLowerCase());
    if (!user) return res.status(401).json({ error: 'invalid' });
    if (user.ativo === 0) return res.status(403).json({ error: 'inactive' });
    const ok = await validateSimPassword(user, String(password));
    if (!ok) return res.status(401).json({ error: 'invalid' });
    const groupId = await ensureGroupForUser(user);
    const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'dev-secret';
    const token = jwt.sign(
      { sub: user.id, group_id: groupId, role: user.role },
      secret,
      { expiresIn: '30d' }
    );
    return res.json({
      token,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        finance_group_id: groupId,
        cycle_day: user.ciclo_dia,
        cycle_next_business_day: user.ciclo_proximo_util,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.get('/categories', apiAuth, async (req, res) => {
  try {
    const categories = await listCategories(req.user.finance_group_id);
    return res.json({ categories });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.post('/categories', apiAuth, async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const { name, type } = req.body || {};
    if (!name || !type) return res.status(400).json({ error: 'missing' });
    const safeType = type === 'income' ? 'income' : 'expense';
    const id = await createCategory({ groupId, name: String(name).trim(), type: safeType });
    return res.status(201).json({ id });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.put('/categories/:id', apiAuth, async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const id = Number(req.params.id);
    const { name, type } = req.body || {};
    if (!id || !name || !type) return res.status(400).json({ error: 'missing' });
    const safeType = type === 'income' ? 'income' : 'expense';
    await updateCategory({ groupId, id, name: String(name).trim(), type: safeType });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.delete('/categories/:id', apiAuth, async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'missing' });
    await deleteCategory(groupId, id);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.get('/budgets', apiAuth, async (req, res) => {
  try {
    const budgets = await listBudgets(req.user.finance_group_id);
    return res.json({ budgets });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.post('/budgets', apiAuth, async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const { category_id, month, amount } = req.body || {};
    if (!category_id || !month || !amount) return res.status(400).json({ error: 'missing' });
    await upsertBudget({
      groupId,
      categoryId: Number(category_id),
      month: String(month).slice(0, 10),
      amount: Number(amount),
    });
    return res.status(201).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.put('/budgets/:id', apiAuth, async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const id = Number(req.params.id);
    const { category_id, month, amount } = req.body || {};
    if (!id || !category_id || !month || !amount) return res.status(400).json({ error: 'missing' });
    await updateBudget({
      groupId,
      id,
      categoryId: Number(category_id),
      month: String(month).slice(0, 10),
      amount: Number(amount),
    });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.delete('/budgets/:id', apiAuth, async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'missing' });
    await deleteBudget(groupId, id);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.get('/transactions', apiAuth, async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const page = Math.max(1, Number(req.query.page || 1));
    const perPage = Math.min(50, Math.max(1, Number(req.query.per_page || 20)));
    const categoryId = req.query.category_id ? Number(req.query.category_id) : null;
    const fromDate = req.query.from ? String(req.query.from) : null;
    const toDate = req.query.to ? String(req.query.to) : null;
    const offset = (page - 1) * perPage;

    const [items, total] = await Promise.all([
      listTransactions({ groupId, categoryId, fromDate, toDate, limit: perPage, offset }),
      countTransactions({ groupId, categoryId, fromDate, toDate }),
    ]);

    return res.json({
      items,
      page,
      per_page: perPage,
      total,
      total_pages: Math.max(1, Math.ceil(total / perPage)),
    });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.post('/transactions', apiAuth, async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const { type, amount, date, description, source, category_id } = req.body || {};
    if (!type || !amount || !date) return res.status(400).json({ error: 'missing' });
    const safeType = type === 'income' ? 'income' : 'expense';
    const id = await createTransaction({
      groupId,
      userId: req.user.id,
      type: safeType,
      categoryId: category_id ? Number(category_id) : null,
      amount: Number(amount),
      occurredOn: date,
      description: description ? String(description).trim() : null,
      source: source ? String(source).trim() : null,
    });
    return res.status(201).json({ id });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.post('/transactions/:id/document', apiAuth, upload.single('documento'), async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'missing' });
    if (!req.file) return res.status(400).json({ error: 'missing_file' });
    const existingDocs = await listDocumentsByTransaction(groupId, id);
    for (const doc of existingDocs) {
      const filePath = path.join(__dirname, '..', 'private_uploads', doc.file_path);
      require('fs').promises.unlink(filePath).catch(() => {});
    }
    await deleteDocumentsByTransaction(groupId, id);
    const docMeta = await normalizeUploadedDocument(req.file);
    const docId = await createDocument({
      groupId,
      transactionId: id,
      userId: req.user.id,
      originalName: docMeta.originalName,
      filePath: docMeta.filePath,
      mimeType: docMeta.mimeType,
      fileSize: docMeta.fileSize,
    });
    return res.status(201).json({ id: docId });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.get('/documents/:id', apiAuth, async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const docId = Number(req.params.id);
    if (!docId) return res.status(400).json({ error: 'missing' });
    const doc = await getDocumentById(docId);
    if (!doc || Number(doc.finance_group_id) !== Number(groupId)) {
      return res.status(404).json({ error: 'not_found' });
    }
    const filePath = path.join(__dirname, '..', 'private_uploads', doc.file_path);
    return res.sendFile(filePath);
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.put('/transactions/:id', apiAuth, async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const id = Number(req.params.id);
    const { type, amount, date, description, category_id } = req.body || {};
    if (!id || !type || !amount || !date) return res.status(400).json({ error: 'missing' });
    const safeType = type === 'income' ? 'income' : 'expense';
    await updateTransaction({
      groupId,
      id,
      type: safeType,
      categoryId: category_id ? Number(category_id) : null,
      amount: Number(amount),
      occurredOn: date,
      description: description ? String(description).trim() : null,
    });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.post('/transactions/:id/void', apiAuth, async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'missing' });
    await voidTransaction(groupId, id);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.delete('/transactions/:id', apiAuth, async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'missing' });
    await deleteTransaction(groupId, id);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.get('/dashboard', apiAuth, async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const now = new Date();
    const { cycleDay, adjustWeekend } = getUserCycleSettings(req.user);
    const { start, end } = getCyclePeriod(now, cycleDay, adjustWeekend);
    const yearStartDate = new Date(now.getFullYear(), 0, 1);
    const yearEndDate = new Date(now.getFullYear(), 11, 31);

    const [
      summary,
      yearSummary,
      byCategory,
      goals,
      totalSummary,
      totalAllocated,
      monthlyAllocated,
    ] = await Promise.all([
      getMonthlySummary(groupId, formatDate(start), formatDate(end)),
      getYearSummary(groupId, formatDate(yearStartDate), formatDate(yearEndDate)),
      getExpenseByCategory(groupId, formatDate(start), formatDate(end)),
      listGoals(groupId),
      getTotalSummary(groupId),
      getTotalAllocated(groupId),
      getMonthlyAllocated(groupId, formatDate(start), formatDate(end)),
    ]);

    const maxCategory = byCategory.reduce((max, row) => Math.max(max, Number(row.total || 0)), 0) || 0;
    const byCategoryWithPerc = byCategory.map(row => ({
      nome: row.nome,
      total: Number(row.total || 0),
      percent: maxCategory ? Math.round((Number(row.total || 0) / maxCategory) * 100) : 0,
    }));

    const incomeTotal = Number(totalSummary.total_income || 0);
    const expenseTotal = Number(totalSummary.total_expense || 0);
    const balanceTotal = incomeTotal - expenseTotal;
    const allocatedTotal = Number(totalAllocated || 0);
    const availableTotal = balanceTotal - allocatedTotal;

    return res.json({
      summary: {
        income: Number(summary.total_income || 0),
        expense: Number(summary.total_expense || 0),
        allocated: Number(monthlyAllocated || 0),
      },
      yearSummary: {
        income: Number(yearSummary.total_income || 0),
        expense: Number(yearSummary.total_expense || 0),
      },
      byCategory: byCategoryWithPerc,
      goals,
      totals: {
        balance: balanceTotal,
        allocated: allocatedTotal,
        available: availableTotal,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.get('/goals', apiAuth, async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const [goals, allocations, totalAllocated] = await Promise.all([
      listGoals(groupId),
      listAllocations(groupId, 100),
      getTotalAllocated(groupId),
    ]);
    return res.json({ goals, allocations, totalAllocated });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.post('/goals', apiAuth, async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const { name, target_amount, target_date } = req.body || {};
    if (!name || !target_amount) return res.status(400).json({ error: 'missing' });
    const id = await createGoal({
      groupId,
      name: String(name).trim(),
      targetAmount: Number(target_amount),
      targetDate: target_date || null,
    });
    return res.status(201).json({ id });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.put('/goals/:id', apiAuth, async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const id = Number(req.params.id);
    const { name, target_amount, target_date } = req.body || {};
    if (!id || !name || !target_amount) return res.status(400).json({ error: 'missing' });
    await updateGoal({
      groupId,
      id,
      name: String(name).trim(),
      targetAmount: Number(target_amount),
      targetDate: target_date || null,
    });
    const allocated = await getGoalAllocatedTotal(groupId, id);
    const status = allocated >= Number(target_amount) ? 'completed' : 'active';
    await updateGoalStatus(groupId, id, status);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.delete('/goals/:id', apiAuth, async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'missing' });
    await deleteGoal(groupId, id);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.post('/goals/:id/allocate', apiAuth, async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const goalId = Number(req.params.id);
    const { amount, date, note } = req.body || {};
    if (!goalId || !amount || !date) return res.status(400).json({ error: 'missing' });
    const goal = await getGoalById(groupId, goalId);
    if (!goal) return res.status(404).json({ error: 'not_found' });
    await addAllocation({
      groupId,
      goalId,
      userId: req.user.id,
      amount: Number(amount),
      date: String(date),
      note: note ? String(note).trim() : null,
    });
    const allocated = await getGoalAllocatedTotal(groupId, goalId);
    if (goal.valor_objetivo && allocated >= Number(goal.valor_objetivo)) {
      await updateGoalStatus(groupId, goalId, 'completed');
    }
    return res.status(201).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.post('/share', apiAuth, async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const email = (req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'missing_email' });
    const result = await linkUserToGroupByEmail({
      ownerUserId: req.user.id,
      ownerGroupId: groupId,
      email,
    });
    if (!result.ok) {
      if (result.reason === 'missing') return res.status(400).json({ error: 'user_missing' });
      if (result.reason === 'self') return res.status(400).json({ error: 'self' });
      if (result.reason === 'owner') return res.status(400).json({ error: 'owner' });
      return res.status(400).json({ error: 'invalid' });
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.put('/goals/allocations/:id', apiAuth, async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const id = Number(req.params.id);
    const { goal_id, amount, date, note } = req.body || {};
    if (!id || !amount || !date) return res.status(400).json({ error: 'missing' });
    const existing = await getAllocationById(groupId, id);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    const nextGoalId = Number(goal_id || existing.goal_id);
    await updateAllocation({
      groupId,
      id,
      goalId: nextGoalId,
      amount: Number(amount),
      date: String(date),
      note: note ? String(note).trim() : null,
    });
    const prevGoalId = Number(existing.goal_id);
    const prevGoal = await getGoalById(groupId, prevGoalId);
    if (prevGoal?.valor_objetivo) {
      const prevAllocated = await getGoalAllocatedTotal(groupId, prevGoalId);
      await updateGoalStatus(groupId, prevGoalId, prevAllocated >= Number(prevGoal.valor_objetivo) ? 'completed' : 'active');
    }
    if (nextGoalId !== prevGoalId) {
      const nextGoal = await getGoalById(groupId, nextGoalId);
      if (nextGoal?.valor_objetivo) {
        const nextAllocated = await getGoalAllocatedTotal(groupId, nextGoalId);
        await updateGoalStatus(groupId, nextGoalId, nextAllocated >= Number(nextGoal.valor_objetivo) ? 'completed' : 'active');
      }
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.delete('/goals/allocations/:id', apiAuth, async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'missing' });
    const existing = await getAllocationById(groupId, id);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    await deleteAllocation(groupId, id);
    const goal = await getGoalById(groupId, existing.goal_id);
    if (goal?.valor_objetivo) {
      const allocated = await getGoalAllocatedTotal(groupId, existing.goal_id);
      await updateGoalStatus(groupId, existing.goal_id, allocated >= Number(goal.valor_objetivo) ? 'completed' : 'active');
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

module.exports = router;

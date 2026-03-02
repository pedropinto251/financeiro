const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { ensureGroupForUser, linkUserToGroupByEmail } = require('../models/financeGroupModel');
const {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  ensureDefaultCategories,
} = require('../models/financeCategoryModel');
const { listBudgets, upsertBudget, updateBudget, deleteBudget } = require('../models/financeBudgetModel');
const {
  createTransaction,
  listRecentTransactions,
  listTransactions,
  countTransactions,
  getMonthlySummary,
  getYearSummary,
  getTotalSummary,
  getExpenseByCategory,
  listTransactionsForReport,
  updateTransaction,
  voidTransaction,
  deleteTransaction,
} = require('../models/financeTransactionModel');
const { normalizeUploadedDocument } = require('../services/documentUpload');
const {
  listGoals,
  createGoal,
  getGoalById,
  addAllocation,
  listAllocations,
  getAllocationById,
  updateAllocation,
  deleteAllocation,
  getGoalAllocatedTotal,
  getTotalAllocated,
  getMonthlyAllocated,
  updateGoalStatus,
  updateGoal,
  deleteGoal,
} = require('../models/goalModel');
const { createDocument, getDocumentById, listDocumentsByTransaction, deleteDocumentsByTransaction } = require('../models/financeDocumentModel');
const {
  listProjects,
  createProject,
  listLists,
  createList,
  listWishlistItems,
  createWishlistItem,
  markWishlistPurchased,
  revertWishlistItem,
  updateWishlistItem,
  deleteWishlistItem,
  getWishlistImageById,
  getWishlistItemById,
} = require('../models/wishlistModel');
const { createShare, listSharedItemsForUser } = require('../models/wishlistShareModel');
const {
  getSimUserByEmail,
  listSimUsers,
  createSimUser,
  updateSimUser,
  getSimUserByEmailExceptId,
} = require('../models/simulatorUserModel');
const { slugify } = require('../services/realestate/utils');
const { fetchRealEstateData } = require('../services/realestate');
const { clampCycleDay, getCyclePeriod, getCyclePeriodForMonth } = require('../services/financePeriod');

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateDisplay(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function getUserCycleSettings(user) {
  const cycleDay = clampCycleDay(
    user?.cycle_day ?? user?.ciclo_dia ?? 1
  );
  const adjustWeekendRaw = user?.cycle_next_business_day ?? user?.ciclo_proximo_util;
  const adjustWeekend = adjustWeekendRaw === true || adjustWeekendRaw === 1 || adjustWeekendRaw === '1' || adjustWeekendRaw === 'on';
  return { cycleDay, adjustWeekend };
}

function normalizeMonthInput(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 10);
  return null;
}

function parseMonthValue(value) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;
  const [y, m] = value.split('-').map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return null;
  return { year: y, monthIndex: m - 1 };
}

function parseYearValue(value) {
  const year = Number(value);
  if (!Number.isInteger(year)) return null;
  if (year < 2000 || year > 2100) return null;
  return year;
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
    wishlist: 'Item guardado no planeamento.',
    purchased: 'Item marcado como comprado.',
    share: 'Partilha criada com sucesso.',
    goal: 'Objetivo criado com sucesso.',
    allocated: 'Poupanca alocada ao objetivo.',
    user: 'Utilizador criado com sucesso.',
    updated: 'Alteracoes guardadas.',
    deleted: 'Registo apagado.',
    reverted: 'Item voltou a planeado.',
  };
  const errorMap = {
    'missing-category': 'Preenche o nome da categoria.',
    'missing-budget': 'Preenche todos os campos do budget.',
    'missing-transaction': 'Preenche tipo, valor e data.',
    'missing-share': 'Indica o email para partilhar.',
    'share-missing': 'O utilizador nao existe.',
    'share-self': 'Nao podes partilhar contigo proprio.',
    'missing-wishlist': 'Preenche o nome do item.',
    'missing-price': 'Indica o preco para registar a compra.',
    'missing-purchase': 'Indica a data de compra.',
    'missing-project': 'Escolhe um projeto e uma lista.',
    'missing-permission': 'Escolhe uma permissao.',
    'share-owner': 'Nao podes partilhar com o mesmo grupo.',
    'missing-edit': 'Preenche os campos obrigatorios.',
    'missing-goal': 'Preenche o nome e o valor do objetivo.',
    'missing-allocation': 'Indica objetivo, valor e data.',
    'insufficient-funds': 'Saldo insuficiente para alocar.',
    'missing-user': 'Preenche nome, email e password.',
    'user-exists': 'Este email ja esta registado.',
    'missing-user-edit': 'Preenche nome e email.',
    'missing-category-edit': 'Preenche nome e tipo da categoria.',
    'missing-budget-edit': 'Preenche todos os campos do budget.',
  };
  return {
    notice: query.notice ? (noticeMap[query.notice] || query.notice) : null,
    error: query.error ? (errorMap[query.error] || query.error) : null,
  };
}

async function renderDashboard(req, res, next) {
  try {
    const groupId = await withGroup(req);
    await ensureDefaultCategories(groupId);
    const now = new Date();
    const { cycleDay, adjustWeekend } = getUserCycleSettings(req.user);
    const { start, end } = getCyclePeriod(now, cycleDay, adjustWeekend);

    const yearStartDate = new Date(now.getFullYear(), 0, 1);
    const yearEndDate = new Date(now.getFullYear(), 11, 31);

    const [summary, byCategory, yearSummary, goals, totalSummary, totalAllocated, monthlyAllocated, categories] = await Promise.all([
      getMonthlySummary(groupId, formatDate(start), formatDate(end)),
      getExpenseByCategory(groupId, formatDate(start), formatDate(end)),
      getYearSummary(groupId, formatDate(yearStartDate), formatDate(yearEndDate)),
      listGoals(groupId),
      getTotalSummary(groupId),
      getTotalAllocated(groupId),
      getMonthlyAllocated(groupId, formatDate(start), formatDate(end)),
      listCategories(groupId),
    ]);

    const incomeTotal = Number(totalSummary.total_income || 0);
    const expenseTotal = Number(totalSummary.total_expense || 0);
    const balanceTotal = incomeTotal - expenseTotal;
    const allocatedTotal = Number(totalAllocated || 0);
    const availableTotal = balanceTotal - allocatedTotal;

    const maxCategory = byCategory.reduce((max, row) => Math.max(max, Number(row.total || 0)), 0) || 0;
    const byCategoryWithPerc = byCategory.map(row => ({
      ...row,
      percent: maxCategory ? Math.round((Number(row.total || 0) / maxCategory) * 100) : 0,
    }));

    res.render('dashboard', {
      title: 'Dashboard',
      user: req.user,
      active: 'dashboard',
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
      categories,
      goals,
      availableTotal,
      allocatedTotal,
      balanceTotal,
      ...buildMessages(req.query),
    });
  } catch (err) {
    return next(err);
  }
}

async function renderTransactions(req, res, next) {
  try {
    const groupId = await withGroup(req);
    await ensureDefaultCategories(groupId);
    const page = Math.max(1, Number(req.query.page || 1));
    const perPage = 20;
    const categoryId = req.query.category_id ? Number(req.query.category_id) : null;
    const offset = (page - 1) * perPage;

    const [categories, recent, total] = await Promise.all([
      listCategories(groupId),
      listTransactions({ groupId, categoryId, limit: perPage, offset }),
      countTransactions({ groupId, categoryId }),
    ]);
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    res.render('transactions', {
      title: 'Movimentos',
      user: req.user,
      active: 'transactions',
      categories,
      recent,
      page,
      totalPages,
      categoryId,
      ...buildMessages(req.query),
    });
  } catch (err) {
    return next(err);
  }
}

async function renderCategories(req, res, next) {
  try {
    const groupId = await withGroup(req);
    await ensureDefaultCategories(groupId);
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
    await ensureDefaultCategories(groupId);
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

async function renderWishlist(req, res, next) {
  try {
    const groupId = await withGroup(req);
    await ensureDefaultCategories(groupId);
    const [projects, items, categories, sharedItems] = await Promise.all([
      listProjects(groupId),
      listWishlistItems(groupId),
      listCategories(groupId),
      listSharedItemsForUser(req.user.id),
    ]);
    const listsByProject = new Map();
    for (const project of projects) {
      const lists = await listLists(groupId, project.id);
      listsByProject.set(project.id, lists);
    }
    const expenseCategories = categories.filter(c => c.tipo === 'expense');
    res.render('wishlist', {
      title: 'Planeamento',
      user: req.user,
      active: 'wishlist',
      projects,
      listsByProject,
      items,
      sharedItems,
      expenseCategories,
      dateDisplay: formatDateDisplay,
      ...buildMessages(req.query),
    });
  } catch (err) {
    return next(err);
  }
}

async function renderGoals(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const [goals, allocations, totalSummary, totalAllocated] = await Promise.all([
      listGoals(groupId),
      listAllocations(groupId, 50),
      getTotalSummary(groupId),
      getTotalAllocated(groupId),
    ]);

    const income = Number(totalSummary.total_income || 0);
    const expense = Number(totalSummary.total_expense || 0);
    const balance = income - expense;
    const available = balance - Number(totalAllocated || 0);

    res.render('goals', {
      title: 'Objetivos',
      user: req.user,
      active: 'goals',
      goals,
      allocations,
      summary: {
        income,
        expense,
        balance,
        allocated: Number(totalAllocated || 0),
        available,
      },
      dateDisplay: formatDateDisplay,
      ...buildMessages(req.query),
    });
  } catch (err) {
    return next(err);
  }
}

async function renderRealEstate(req, res, next) {
  try {
    res.render('realestate', {
      title: 'Imoveis',
      user: req.user,
      active: 'realestate',
      ...buildMessages(req.query),
    });
  } catch (err) {
    return next(err);
  }
}

async function handleRealEstateData(req, res) {
  try {
    const districtRaw = (req.query.district || "aveiro").toString();
    const councilRaw = (req.query.council || "espinho").toString();
    const pageRaw = Number(req.query.page || 1);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

    const data = await fetchRealEstateData({ districtRaw, councilRaw, page });
    return res.json(data);
  } catch (err) {
    console.error("realestate:data failed", err);
    return res.status(500).json({
      error: "server",
      message: err instanceof Error ? err.message : "unknown",
      cause: err && typeof err === "object" && err.cause ? String(err.cause) : undefined,
    });
  }
}

async function handleRealEstateLocationsBuild(req, res) {
  const urls = [
    'https://json.geoapi.pt/distritos/municipios',
    'https://geoapi.pt/distritos/municipios?json=1',
  ];
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const outputPath = path.join(__dirname, '..', 'public', 'data', 'portugal-locations.json');

  const fetchJson = async (url, attempts = 2) => {
    let lastErr = null;
    for (let i = 0; i < attempts; i += 1) {
      const res = await fetch(url, {
        headers: {
          accept: 'application/json',
          'user-agent': 'financeiro/1.0 (locations-build)',
        },
      });
      if (res.ok) return res.json();
      const retryAfter = res.headers.get('retry-after');
      if (res.status === 429) {
        const waitMs = retryAfter ? Number(retryAfter) * 1000 : 1000 * (i + 1);
        if (waitMs > 15000) {
          lastErr = new Error(`HTTP ${res.status} for ${url}`);
          break;
        }
        await sleep(waitMs);
        lastErr = new Error(`HTTP ${res.status} for ${url}`);
        continue;
      }
      lastErr = new Error(`HTTP ${res.status} for ${url}`);
      break;
    }
    throw lastErr || new Error(`HTTP error for ${url}`);
  };

  try {
    let payload = null;
    let lastErr = null;
    for (const url of urls) {
      try {
        payload = await fetchJson(url);
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!payload) throw lastErr || new Error('no_source');

    const districts = [];
    const byDistrict = {};
    payload.forEach((entry) => {
      const name = entry.distrito || entry.Distrito || entry.nome || entry.name;
      const municipios = entry.municipios || entry.concelhos || [];
      if (!name || !Array.isArray(municipios)) return;
      const district = { name: String(name), slug: slugify(name) };
      districts.push(district);
      byDistrict[district.slug] = municipios
        .map((m) => {
          if (typeof m === 'string') return m;
          if (m && typeof m === 'object') {
            return m.nome || m.name || m.municipio || m.Municipio || m.concelho || m.Concelho || '';
          }
          return '';
        })
        .filter(Boolean)
        .map((m) => ({
          name: String(m),
          slug: slugify(m),
        }));
    });

    const output = {
      districts: districts.sort((a, b) => a.name.localeCompare(b.name, 'pt')),
      byDistrict,
      source: 'geoapi.pt',
      updatedAt: new Date().toISOString(),
    };

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

    return res.json({ ok: true, districts: output.districts.length });
  } catch (err) {
    return res.status(502).json({
      ok: false,
      error: 'locations_build_failed',
      message: err instanceof Error ? err.message : 'unknown',
    });
  }
}

async function renderAdminUsers(req, res, next) {
  try {
    const users = await listSimUsers();
    res.render('admin-users', {
      title: 'Utilizadores',
      user: req.user,
      active: 'admin-users',
      users,
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

async function handleUpdateCategory(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { id, name, type } = req.body;
    if (!id || !name || !type) return res.redirect('/categories?error=missing-category-edit');
    const safeType = type === 'income' ? 'income' : 'expense';
    await updateCategory({
      groupId,
      id: Number(id),
      name: name.trim(),
      type: safeType,
    });
    return res.redirect('/categories?notice=updated');
  } catch (err) {
    return next(err);
  }
}

async function handleDeleteCategory(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { id } = req.body;
    if (!id) return res.redirect('/categories');
    await deleteCategory(groupId, Number(id));
    return res.redirect('/categories?notice=deleted');
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

async function handleUpdateBudget(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { id, category_id, month, amount } = req.body;
    const normalizedMonth = normalizeMonthInput(month);
    if (!id || !category_id || !normalizedMonth || !amount) {
      return res.redirect('/budgets?error=missing-budget-edit');
    }
    await updateBudget({
      groupId,
      id: Number(id),
      categoryId: Number(category_id),
      month: normalizedMonth,
      amount: Number(amount),
    });
    return res.redirect('/budgets?notice=updated');
  } catch (err) {
    return next(err);
  }
}

async function handleDeleteBudget(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { id } = req.body;
    if (!id) return res.redirect('/budgets');
    await deleteBudget(groupId, Number(id));
    return res.redirect('/budgets?notice=deleted');
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
      const docMeta = await normalizeUploadedDocument(req.file);
      await createDocument({
        groupId,
        transactionId,
        userId: req.user.id,
        originalName: docMeta.originalName,
        filePath: docMeta.filePath,
        mimeType: docMeta.mimeType,
        fileSize: docMeta.fileSize,
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

async function handleCreateWishlist(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { name, description, link_url, price, target_date, purchased_date, category_id, project_id, list_id } = req.body;
    if (!name) return res.redirect('/wishlist?error=missing-wishlist');
    if (!project_id || !list_id) return res.redirect('/wishlist?error=missing-project');
    const wantsPurchased = Boolean(purchased_date);
    if (wantsPurchased && (!price || Number(price) <= 0)) {
      return res.redirect('/wishlist?error=missing-price');
    }

    let transactionId = null;
    if (wantsPurchased) {
      transactionId = await createTransaction({
        groupId,
        userId: req.user.id,
        type: 'expense',
        categoryId: category_id ? Number(category_id) : null,
        amount: Number(price),
        occurredOn: purchased_date,
        description: `Compra: ${String(name).trim()}`,
        source: null,
      });
    }

    await createWishlistItem({
      groupId,
      projectId: Number(project_id),
      listId: Number(list_id),
      name: String(name).trim(),
      description: description ? String(description).trim() : null,
      imagePath: req.file ? req.file.filename : null,
      linkUrl: link_url ? String(link_url).trim() : null,
      price: price ? Number(price) : null,
      targetDate: target_date || null,
      status: wantsPurchased ? 'purchased' : 'planned',
      purchasedDate: wantsPurchased ? purchased_date : null,
      transactionId,
    });

    return res.redirect('/wishlist?notice=wishlist');
  } catch (err) {
    return next(err);
  }
}

async function handleCreateWishlistProject(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { name, note } = req.body;
    if (!name) return res.redirect('/wishlist?error=missing-project');
    await createProject({ groupId, name: String(name).trim(), note: note ? String(note).trim() : null });
    return res.redirect('/wishlist?notice=project');
  } catch (err) {
    return next(err);
  }
}

async function handleCreateWishlistList(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { project_id, name } = req.body;
    if (!project_id || !name) return res.redirect('/wishlist?error=missing-list');
    await createList({ groupId, projectId: Number(project_id), name: String(name).trim() });
    return res.redirect('/wishlist?notice=list');
  } catch (err) {
    return next(err);
  }
}

async function handleMarkWishlistPurchased(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { item_id, purchased_date, price, category_id } = req.body;
    if (!item_id || !purchased_date) {
      return res.redirect('/wishlist?error=missing-purchase');
    }
    let transactionId = null;
    if (price && Number(price) > 0) {
      transactionId = await createTransaction({
        groupId,
        userId: req.user.id,
        type: 'expense',
        categoryId: category_id ? Number(category_id) : null,
        amount: Number(price),
        occurredOn: purchased_date,
        description: 'Compra (planeamento)',
        source: null,
      });
    }

    await markWishlistPurchased({
      groupId,
      itemId: Number(item_id),
      purchasedDate: purchased_date,
      price: price ? Number(price) : null,
      transactionId,
    });

    return res.redirect('/wishlist?notice=purchased');
  } catch (err) {
    return next(err);
  }
}

async function handleCreateWishlistShare(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { email, permission, project_id, list_id } = req.body;
    if (!email) return res.redirect('/wishlist?error=missing-share');
    if (!permission) return res.redirect('/wishlist?error=missing-permission');
    if (!project_id) return res.redirect('/wishlist?error=missing-project');

    const user = await getSimUserByEmail(email.trim().toLowerCase());
    if (!user) return res.redirect('/wishlist?error=share-missing');
    if (Number(user.id) === Number(req.user.id)) return res.redirect('/wishlist?error=share-self');
    if (user.finance_group_id && Number(user.finance_group_id) === Number(groupId)) {
      return res.redirect('/wishlist?error=share-owner');
    }

    await createShare({
      ownerGroupId: groupId,
      projectId: Number(project_id),
      listId: list_id ? Number(list_id) : null,
      sharedWithUserId: user.id,
      permission,
    });

    return res.redirect('/wishlist?notice=share');
  } catch (err) {
    return next(err);
  }
}

async function handleCreateGoal(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { name, target_amount, target_date } = req.body;
    if (!name || !target_amount) return res.redirect('/goals?error=missing-goal');
    await createGoal({
      groupId,
      name: name.trim(),
      targetAmount: Number(target_amount),
      targetDate: target_date || null,
    });
    return res.redirect('/goals?notice=goal');
  } catch (err) {
    return next(err);
  }
}

async function handleUpdateGoal(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { goal_id, name, target_amount, target_date } = req.body;
    if (!goal_id || !name || !target_amount) return res.redirect('/goals?error=missing-goal');
    await updateGoal({
      groupId,
      id: Number(goal_id),
      name: name.trim(),
      targetAmount: Number(target_amount),
      targetDate: target_date || null,
    });

    const goalAllocated = await getGoalAllocatedTotal(groupId, Number(goal_id));
    const status = goalAllocated >= Number(target_amount) ? 'completed' : 'active';
    await updateGoalStatus(groupId, Number(goal_id), status);

    return res.redirect('/goals?notice=updated');
  } catch (err) {
    return next(err);
  }
}

async function handleDeleteGoal(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { goal_id } = req.body;
    if (!goal_id) return res.redirect('/goals?error=missing-goal');
    await deleteGoal(groupId, Number(goal_id));
    return res.redirect('/goals?notice=deleted');
  } catch (err) {
    return next(err);
  }
}

async function handleAddAllocation(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { goal_id, amount, date, note } = req.body;
    const backTo = req.body.back_to || '/goals';
    if (!goal_id || !amount || !date) return res.redirect(`${backTo}?error=missing-allocation`);
    const goal = await getGoalById(groupId, Number(goal_id));
    if (!goal) return res.redirect(`${backTo}?error=missing-goal`);

    const totalSummary = await getTotalSummary(groupId);
    const totalAllocated = await getTotalAllocated(groupId);
    const balance = Number(totalSummary.total_income || 0) - Number(totalSummary.total_expense || 0);
    const available = balance - Number(totalAllocated || 0);
    if (Number(amount) > available) {
      return res.redirect(`${backTo}?error=insufficient-funds`);
    }

    await addAllocation({
      groupId,
      goalId: Number(goal_id),
      userId: req.user.id,
      amount: Number(amount),
      date,
      note: note ? String(note).trim() : null,
    });

    const goalAllocated = await getGoalAllocatedTotal(groupId, Number(goal_id));
    if (goal.valor_objetivo && Number(goalAllocated) >= Number(goal.valor_objetivo)) {
      await updateGoalStatus(groupId, Number(goal_id), 'completed');
    }

    return res.redirect(`${backTo}?notice=allocated`);
  } catch (err) {
    return next(err);
  }
}

async function handleCreateUser(req, res, next) {
  try {
    const { name, email, password, role, cycle_day, cycle_next_business_day } = req.body;
    if (!name || !email || !password) return res.redirect('/admin/users?error=missing-user');
    const existing = await getSimUserByEmail(email.trim().toLowerCase());
    if (existing) return res.redirect('/admin/users?error=user-exists');

    await createSimUser({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: String(password),
      role: role === 'admin' ? 'admin' : 'user',
      cycleDay: clampCycleDay(cycle_day),
      cycleNextBusinessDay: cycle_next_business_day === '1' || cycle_next_business_day === 'on',
    });
    return res.redirect('/admin/users?notice=user');
  } catch (err) {
    return next(err);
  }
}

async function handleUpdateUser(req, res, next) {
  try {
    const { user_id, name, email, role, active, cycle_day, cycle_next_business_day } = req.body;
    if (!user_id || !name || !email) return res.redirect('/admin/users?error=missing-user-edit');
    const existing = await getSimUserByEmailExceptId(email.trim().toLowerCase(), Number(user_id));
    if (existing) return res.redirect('/admin/users?error=user-exists');

    await updateSimUser({
      id: Number(user_id),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: role === 'admin' ? 'admin' : 'user',
      active: active === '1' || active === 'on',
      cycleDay: clampCycleDay(cycle_day),
      cycleNextBusinessDay: cycle_next_business_day === '1' || cycle_next_business_day === 'on',
    });
    return res.redirect('/admin/users?notice=updated');
  } catch (err) {
    return next(err);
  }
}

async function handleUpdateAllocation(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { allocation_id, goal_id, amount, date, note } = req.body;
    const backTo = req.body.back_to || '/goals';
    if (!allocation_id || !goal_id || !amount || !date) {
      return res.redirect(`${backTo}?error=missing-allocation`);
    }
    const allocation = await getAllocationById(groupId, Number(allocation_id));
    if (!allocation) return res.redirect(`${backTo}?error=missing-allocation`);

    const totalSummary = await getTotalSummary(groupId);
    const totalAllocated = await getTotalAllocated(groupId);
    const balance = Number(totalSummary.total_income || 0) - Number(totalSummary.total_expense || 0);
    const available = balance - Number(totalAllocated || 0);
    const delta = Number(amount) - Number(allocation.valor || 0);
    if (delta > available) {
      return res.redirect(`${backTo}?error=insufficient-funds`);
    }

    await updateAllocation({
      groupId,
      id: Number(allocation_id),
      goalId: Number(goal_id),
      amount: Number(amount),
      date,
      note: note ? String(note).trim() : null,
    });

    const goal = await getGoalById(groupId, Number(goal_id));
    const goalAllocated = await getGoalAllocatedTotal(groupId, Number(goal_id));
    if (goal && goal.valor_objetivo && Number(goalAllocated) >= Number(goal.valor_objetivo)) {
      await updateGoalStatus(groupId, Number(goal_id), 'completed');
    }

    return res.redirect(`${backTo}?notice=updated`);
  } catch (err) {
    return next(err);
  }
}

async function handleDeleteAllocation(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { allocation_id } = req.body;
    const backTo = req.body.back_to || '/goals';
    if (!allocation_id) return res.redirect(`${backTo}?error=missing-allocation`);
    await deleteAllocation(groupId, Number(allocation_id));
    return res.redirect(`${backTo}?notice=deleted`);
  } catch (err) {
    return next(err);
  }
}

async function handleWishlistImage(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const itemId = Number(req.params.id);
    if (!itemId) return res.redirect('/wishlist');
    const row = await getWishlistImageById(groupId, itemId);
    if (!row || !row.imagem_path) return res.redirect('/wishlist');
    const filePath = path.join(__dirname, '..', 'private_uploads', 'wishlist', row.imagem_path);
    return res.sendFile(filePath);
  } catch (err) {
    return next(err);
  }
}

async function handleUpdateTransaction(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { id, type, amount, date, description, category_id } = req.body;
    if (!id || !type || !amount || !date) {
      return res.redirect('/transactions?error=missing-edit');
    }
    await updateTransaction({
      groupId,
      id: Number(id),
      type: type === 'income' ? 'income' : 'expense',
      categoryId: category_id ? Number(category_id) : null,
      amount: Number(amount),
      occurredOn: date,
      description: description ? description.trim() : null,
    });

    if (req.file) {
      const docs = await listDocumentsByTransaction(groupId, Number(id));
      for (const doc of docs) {
        const filePath = path.join(__dirname, '..', 'private_uploads', doc.file_path);
        require('fs').promises.unlink(filePath).catch(() => {});
      }
      await deleteDocumentsByTransaction(groupId, Number(id));
      const docMeta = await normalizeUploadedDocument(req.file);
      await createDocument({
        groupId,
        transactionId: Number(id),
        userId: req.user.id,
        originalName: docMeta.originalName,
        filePath: docMeta.filePath,
        mimeType: docMeta.mimeType,
        fileSize: docMeta.fileSize,
      });
    }
    return res.redirect('/transactions?notice=updated');
  } catch (err) {
    return next(err);
  }
}

async function handleVoidTransaction(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { id } = req.body;
    if (!id) return res.redirect('/transactions');
    await voidTransaction(groupId, Number(id));
    return res.redirect('/transactions?notice=updated');
  } catch (err) {
    return next(err);
  }
}

async function handleDeleteTransaction(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { id } = req.body;
    if (!id) return res.redirect('/transactions');
    const docs = await listDocumentsByTransaction(groupId, Number(id));
    for (const doc of docs) {
      const filePath = path.join(__dirname, '..', 'private_uploads', doc.file_path);
      require('fs').promises.unlink(filePath).catch(() => {});
    }
    await deleteDocumentsByTransaction(groupId, Number(id));
    await deleteTransaction(groupId, Number(id));
    return res.redirect('/transactions?notice=deleted');
  } catch (err) {
    return next(err);
  }
}

async function handleUpdateWishlistItem(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { item_id, name, description, price, target_date, link_url, list_id } = req.body;
    if (!item_id || !name || !list_id) return res.redirect('/wishlist?error=missing-edit');
    await updateWishlistItem({
      groupId,
      itemId: Number(item_id),
      name: String(name).trim(),
      description: description ? String(description).trim() : null,
      price: price ? Number(price) : null,
      targetDate: target_date || null,
      linkUrl: link_url ? String(link_url).trim() : null,
      listId: Number(list_id),
    });
    return res.redirect('/wishlist?notice=updated');
  } catch (err) {
    return next(err);
  }
}

async function handleDeleteWishlistItem(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { item_id } = req.body;
    if (!item_id) return res.redirect('/wishlist');
    await deleteWishlistItem(groupId, Number(item_id));
    return res.redirect('/wishlist?notice=deleted');
  } catch (err) {
    return next(err);
  }
}

async function handleRevertWishlistItem(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { item_id } = req.body;
    if (!item_id) return res.redirect('/wishlist');
    const item = await getWishlistItemById(groupId, Number(item_id));
    if (item && item.transaction_id) {
      await voidTransaction(groupId, Number(item.transaction_id));
    }
    await revertWishlistItem(groupId, Number(item_id));
    return res.redirect('/wishlist?notice=reverted');
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

async function handleExportReport(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const now = new Date();
    const period = req.query.period === 'year' ? 'year' : 'month';
    const { cycleDay, adjustWeekend } = getUserCycleSettings(req.user);

    let start = null;
    let end = null;
    let label = '';
    let filenameTag = '';

    if (period === 'year') {
      const year = parseYearValue(req.query.year) || now.getFullYear();
      start = new Date(year, 0, 1);
      end = new Date(year, 11, 31);
      label = `Ano ${year}`;
      filenameTag = `ano-${year}`;
    } else {
      const monthValue = parseMonthValue(req.query.month);
      if (monthValue) {
        const cycle = getCyclePeriodForMonth(monthValue.year, monthValue.monthIndex, cycleDay, adjustWeekend);
        start = cycle.start;
        end = cycle.end;
        const mm = String(monthValue.monthIndex + 1).padStart(2, '0');
        label = `Mes ${monthValue.year}-${mm}`;
        filenameTag = `mes-${monthValue.year}-${mm}`;
      } else {
        const cycle = getCyclePeriod(now, cycleDay, adjustWeekend);
        start = cycle.start;
        end = cycle.end;
        const mm = String(cycle.cycleMonth + 1).padStart(2, '0');
        label = `Mes ${cycle.cycleYear}-${mm}`;
        filenameTag = `mes-${cycle.cycleYear}-${mm}`;
      }
    }

    const fromDate = formatDate(start);
    const toDate = formatDate(end);

    const [expenses, byCategory] = await Promise.all([
      listTransactionsForReport({ groupId, fromDate, toDate, type: 'expense' }),
      getExpenseByCategory(groupId, fromDate, toDate),
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Financeiro';
    workbook.created = new Date();

    const summarySheet = workbook.addWorksheet('Resumo');
    summarySheet.columns = [
      { header: 'Campo', key: 'campo', width: 28 },
      { header: 'Valor', key: 'valor', width: 40 },
    ];
    summarySheet.addRow({ campo: 'Periodo', valor: label });
    summarySheet.addRow({ campo: 'Data inicio', valor: formatDate(start) });
    summarySheet.addRow({ campo: 'Data fim', valor: formatDate(end) });
    summarySheet.addRow({});
    summarySheet.addRow({ campo: 'Total gasto', valor: Number(byCategory.reduce((sum, row) => sum + Number(row.total || 0), 0)).toFixed(2) });
    summarySheet.addRow({});
    summarySheet.addRow({ campo: 'Gastos por categoria', valor: '' });
    summarySheet.addRow({ campo: 'Categoria', valor: 'Total' });
    byCategory.forEach((row) => {
      summarySheet.addRow({ campo: row.nome, valor: Number(row.total || 0) });
    });

    const txSheet = workbook.addWorksheet('Movimentos');
    txSheet.columns = [
      { header: 'Data', key: 'data', width: 14 },
      { header: 'Categoria', key: 'categoria', width: 26 },
      { header: 'Descricao', key: 'descricao', width: 40 },
      { header: 'Fonte', key: 'fonte', width: 24 },
      { header: 'Valor', key: 'valor', width: 14 },
    ];
    expenses.forEach((row) => {
      txSheet.addRow({
        data: row.data_ocorrencia ? new Date(row.data_ocorrencia) : null,
        categoria: row.categoria_nome || 'Sem categoria',
        descricao: row.descricao || '',
        fonte: row.fonte || '',
        valor: Number(row.valor || 0),
      });
    });
    txSheet.getColumn('data').numFmt = 'yyyy-mm-dd';
    txSheet.getColumn('valor').numFmt = '#,##0.00';

    const filename = `relatorio-${filenameTag}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    return res.end();
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
  renderWishlist,
  renderGoals,
  renderRealEstate,
  renderAdminUsers,
  handleCreateCategory,
  handleUpdateCategory,
  handleDeleteCategory,
  handleCreateBudget,
  handleUpdateBudget,
  handleDeleteBudget,
  handleCreateTransaction,
  handleShare,
  handleDownloadDocument,
  handleCreateWishlist,
  handleCreateWishlistProject,
  handleCreateWishlistList,
  handleMarkWishlistPurchased,
  handleWishlistImage,
  handleCreateWishlistShare,
  handleUpdateTransaction,
  handleVoidTransaction,
  handleDeleteTransaction,
  handleUpdateWishlistItem,
  handleDeleteWishlistItem,
  handleRevertWishlistItem,
  handleCreateGoal,
  handleUpdateGoal,
  handleDeleteGoal,
  handleAddAllocation,
  handleUpdateAllocation,
  handleDeleteAllocation,
  handleCreateUser,
  handleUpdateUser,
  handleRealEstateData,
  handleRealEstateLocationsBuild,
  handleExportReport,
};

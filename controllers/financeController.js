const path = require('path');
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
  updateTransaction,
  voidTransaction,
  deleteTransaction,
} = require('../models/financeTransactionModel');
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
    const start = monthStart(now);
    const end = monthEnd(now);

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
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.redirect('/admin/users?error=missing-user');
    const existing = await getSimUserByEmail(email.trim().toLowerCase());
    if (existing) return res.redirect('/admin/users?error=user-exists');

    await createSimUser({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: String(password),
      role: role === 'admin' ? 'admin' : 'user',
    });
    return res.redirect('/admin/users?notice=user');
  } catch (err) {
    return next(err);
  }
}

async function handleUpdateUser(req, res, next) {
  try {
    const { user_id, name, email, role, active } = req.body;
    if (!user_id || !name || !email) return res.redirect('/admin/users?error=missing-user-edit');
    const existing = await getSimUserByEmailExceptId(email.trim().toLowerCase(), Number(user_id));
    if (existing) return res.redirect('/admin/users?error=user-exists');

    await updateSimUser({
      id: Number(user_id),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: role === 'admin' ? 'admin' : 'user',
      active: active === '1' || active === 'on',
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

module.exports = {
  renderDashboard,
  renderTransactions,
  renderCategories,
  renderBudgets,
  renderShare,
  renderWishlist,
  renderGoals,
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
};

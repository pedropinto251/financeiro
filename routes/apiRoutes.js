const express = require('express');
const jwt = require('jsonwebtoken');
const { getSimUserByEmail, getSimUserById, listSimUsers, validateSimPassword, updateUserCycle } = require('../models/simulatorUserModel');
const push = require('../services/push');
const pushModel = require('../models/financePushModel');
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
  getLastTransactionDate,
  updateTransactionCategory,
  getTransactionsSummary,
  getCategoryBreakdown,
  getMonthlySeries,
  listTransactionsForReport,
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
const { clampCycleDay, getCyclePeriod, CYCLE_LAST_BUSINESS, CYCLE_LAST_CALENDAR } = require('../services/financePeriod');
const { handleYeastarCallReport } = require('../controllers/yeastarController');
const { getMonthlySavingsTarget, setMonthlySavingsTarget } = require('../models/financeSavingsModel');
const {
  listAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
} = require('../models/financeAccountModel');
const {
  listRecurring,
  getRecurringById,
  createRecurring,
  updateRecurring,
  setProximaData,
  deleteRecurring,
  countDue,
  nextOccurrence,
  firstOccurrence,
} = require('../models/financeRecurringModel');

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Lança as ocorrências de fixas em atraso até `today` (partilhado pelo botão
// manual e pelo cron horário). Devolve o nº de movimentos criados.
async function runDueRecurring(groupId, userId, today) {
  const toIso = (v) => (v instanceof Date ? formatDate(v) : String(v).slice(0, 10));
  const items = await listRecurring(groupId);
  let created = 0;
  for (const r of items) {
    if (!r.ativo) continue;
    let due = toIso(r.proxima_data);
    const startDue = due;
    let guard = 0;
    while (due <= today && guard < 60) {
      await createTransaction({
        groupId, userId,
        type: r.tipo === 'income' ? 'income' : 'expense',
        categoryId: r.categoria_id || null,
        amount: Number(r.valor),
        occurredOn: due,
        description: r.descricao || null,
        source: 'recorrente',
        accountId: r.account_id || null,
      });
      created += 1;
      due = nextOccurrence(due, r.frequencia, r.intervalo, r.dia);
      guard += 1;
    }
    if (due !== startDue) await setProximaData(groupId, r.id, due);
  }
  return created;
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

// Endpoint publico para relatorio de chamadas Yeastar (sem auth)
router.post('/yeastar/call-report', handleYeastarCallReport);
router.get('/yeastar/call-report', handleYeastarCallReport);

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
    const safeUser = {
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: user.role,
      finance_group_id: groupId,
      cycle_day: user.ciclo_dia,
      cycle_next_business_day: user.ciclo_proximo_util,
    };
    // Also open a session so the web SPA (cookie auth, withCredentials) works.
    if (req.session) req.session.simUser = safeUser;
    return res.json({ token, user: safeUser });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

// Current session/token user — used by the SPA to bootstrap auth.
router.get('/me', apiAuth, (req, res) => {
  const u = req.user;
  return res.json({
    user: {
      id: u.id,
      nome: u.nome,
      email: u.email,
      role: u.role,
      finance_group_id: u.finance_group_id,
      cycle_day: u.cycle_day,
      cycle_next_business_day: u.cycle_next_business_day,
    },
  });
});

// User self-service: define the salary/cycle day.
//  - 1..28          → dia fixo do mês (com ajuste opcional para próximo dia útil)
//  - CYCLE_LAST_BUSINESS (99)  → último dia útil do mês
//  - CYCLE_LAST_CALENDAR (100) → último dia do mês (civil)
router.put('/me/cycle', apiAuth, async (req, res) => {
  try {
    const { cycle_day, cycle_next_business_day } = req.body || {};
    let day = Number(cycle_day);
    if (day !== CYCLE_LAST_BUSINESS && day !== CYCLE_LAST_CALENDAR) {
      day = Math.min(28, Math.max(1, Math.floor(day || 1)));
    }
    const adjust = cycle_next_business_day ? 1 : 0;
    await updateUserCycle({ id: req.user.id, cycleDay: day, cycleNextBusinessDay: adjust });
    if (req.session && req.session.simUser) {
      req.session.simUser.cycle_day = day;
      req.session.simUser.cycle_next_business_day = adjust;
    }
    return res.json({ ok: true, cycle_day: day, cycle_next_business_day: adjust });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

// Meta de poupança mensal (preenche-se automaticamente com receitas − despesas).
router.get('/savings-target', apiAuth, async (req, res) => {
  try {
    const target = await getMonthlySavingsTarget(req.user.finance_group_id);
    return res.json({ target });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.put('/savings-target', apiAuth, async (req, res) => {
  try {
    const target = await setMonthlySavingsTarget(req.user.finance_group_id, req.body?.target);
    return res.json({ ok: true, target });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

// ── Web Push ──────────────────────────────────────────────────────────────
router.get('/push/key', apiAuth, async (req, res) => {
  try {
    const key = await push.getPublicKey();
    return res.json({ key, available: !!key });
  } catch (err) { return res.status(500).json({ error: 'server' }); }
});

router.post('/push/subscribe', apiAuth, async (req, res) => {
  try {
    const sub = req.body || {};
    const endpoint = sub.endpoint;
    const p256dh = sub.keys && sub.keys.p256dh;
    const auth = sub.keys && sub.keys.auth;
    if (!endpoint || !p256dh || !auth) return res.status(400).json({ error: 'missing' });
    await pushModel.saveSubscription({ groupId: req.user.finance_group_id, userId: req.user.id, endpoint, p256dh, auth });
    return res.status(201).json({ ok: true });
  } catch (err) { return res.status(500).json({ error: 'server' }); }
});

router.post('/push/unsubscribe', apiAuth, async (req, res) => {
  try {
    if (req.body && req.body.endpoint) await pushModel.deleteByEndpoint(req.body.endpoint);
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: 'server' }); }
});

router.post('/push/test', apiAuth, async (req, res) => {
  try {
    const subs = await pushModel.listByUser(req.user.id);
    if (!subs.length) return res.status(400).json({ error: 'no_subscription' });
    const r = await push.sendToSubs(subs, { title: 'Financeiro', body: 'Notificações ativadas ✅', url: '/dashboard' });
    if (!r.available) return res.status(503).json({ error: 'push_unavailable' });
    return res.json({ ok: true, sent: r.sent });
  } catch (err) { return res.status(500).json({ error: 'server' }); }
});

// URL do cron (só admin) — para colares no cPanel → Cron Jobs.
router.get('/cron-info', apiAuth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
    const token = await push.getCronToken();
    const base = `${req.protocol}://${req.get('host')}`;
    return res.json({ url: `${base}/api/cron/notify?token=${token}`, cron: `0 8 * * * curl -s "${base}/api/cron/notify?token=${token}" >/dev/null 2>&1` });
  } catch (err) { return res.status(500).json({ error: 'server' }); }
});

// Cron diário (protegido por token): envia alertas de salário, fixas pendentes e budgets excedidos.
//   curl "https://financeiro.softpinto.pt/api/cron/notify?token=XXX"
router.get('/cron/notify', async (req, res) => {
  try {
    const token = await push.getCronToken();
    if (!req.query.token || req.query.token !== token) return res.status(403).json({ error: 'forbidden' });
    const subs = await pushModel.listAll();
    const today = formatDate(new Date());
    const subsByUser = new Map();
    for (const s of subs) { if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, []); subsByUser.get(s.user_id).push(s); }
    const eur0 = (v) => `${Math.round(Number(v) || 0)} €`;
    const seen = async (key) => (await pushModel.getConfig('notif:' + key)) === '1';
    const mark = (key) => pushModel.setConfig('notif:' + key, '1');
    const clear = (key) => pushModel.setConfig('notif:' + key, '');
    const dayMs = 86400000;
    let totalSent = 0;

    const users = await listSimUsers().catch(() => []);
    for (const user of users) {
      if (user.ativo === 0) continue;
      const userId = user.id;
      const groupId = await ensureGroupForUser(user);
      const { cycleDay, adjustWeekend } = getUserCycleSettings(user);
      const { start, end } = getCyclePeriod(new Date(), cycleDay, adjustWeekend);
      const startIso = formatDate(start);
      const endIso = formatDate(end);
      const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);

      // Lança fixas em atraso automaticamente (para todos os utilizadores).
      let autoLaunched = 0;
      try { autoLaunched = await runDueRecurring(groupId, userId, today); } catch (e) { /* */ }

      // Notificações só para quem tem push subscrito.
      const userSubs = subsByUser.get(userId);
      if (!userSubs || !userSubs.length) continue;
      const msgs = [];

      try {
        if (autoLaunched > 0) msgs.push(`Lancei ${autoLaunched} fixa(s) automaticamente`);
        if (startIso === today) { const k = `${userId}:salary:${startIso}`; if (!(await seen(k))) { msgs.push('Hoje é dia de salário 🎉'); await mark(k); } }

        const cyc = await getMonthlySummary(groupId, startIso, endIso);
        const income = Number(cyc.total_income || 0);
        const expense = Number(cyc.total_expense || 0);
        const saved = income - expense;

        // Objetivos cumpridos (uma vez; reabre se descer abaixo da meta)
        const goals = await listGoals(groupId).catch(() => []);
        for (const go of goals) {
          const tgt = Number(go.valor_objetivo || 0);
          const alloc = Number(go.total_alocado || 0);
          const k = `${userId}:goaldone:${go.id}`;
          if (tgt > 0 && alloc >= tgt) { if (!(await seen(k))) { msgs.push(`Objetivo "${go.nome}" cumprido — já o podes usar`); await mark(k); } }
          else { await clear(k); }
        }

        // Meta de poupança: atingida / progresso perto do fim do ciclo
        const target = Number(await getMonthlySavingsTarget(groupId).catch(() => 0));
        if (target > 0) {
          if (saved >= target) { const k = `${userId}:savingsmet:${startIso}`; if (!(await seen(k))) { msgs.push('Bateste a meta de poupança 🎉'); await mark(k); } }
          else {
            const daysToEnd = Math.round((end - todayDate) / dayMs);
            if (daysToEnd >= 0 && daysToEnd <= 5) { const k = `${userId}:savingsprog:${startIso}`; if (!(await seen(k))) { msgs.push(`Meta de poupança a ${Math.round((saved / target) * 100)}% · faltam ${eur0(target - saved)}`); await mark(k); } }
          }
        }

        // Fim de ciclo (último dia)
        if (today === endIso) { const k = `${userId}:cyclesum:${startIso}`; if (!(await seen(k))) { msgs.push(`Fim de ciclo: poupaste ${eur0(saved)} (taxa ${income > 0 ? Math.round((saved / income) * 100) : 0}%)`); await mark(k); } }

        // Budgets ≥80% / ≥100% (uma vez por ciclo por categoria)
        const [budgets, spend] = await Promise.all([
          listBudgets(groupId),
          getExpenseByCategory(groupId, startIso, endIso),
        ]);
        const spendMap = new Map(spend.map((r) => [Number(r.categoria_id), Number(r.total || 0)]));
        for (const b of budgets) {
          const lim = Number(b.valor || 0); if (lim <= 0) continue;
          const pct = (spendMap.get(Number(b.categoria_id)) || 0) / lim;
          if (pct >= 1) { const k = `${userId}:bud100:${startIso}:${b.categoria_id}`; if (!(await seen(k))) { msgs.push(`Budget "${b.categoria_nome}" excedido`); await mark(k); } }
          else if (pct >= 0.8) { const k = `${userId}:bud80:${startIso}:${b.categoria_id}`; if (!(await seen(k))) { msgs.push(`Budget "${b.categoria_nome}" a ${Math.round(pct * 100)}%`); await mark(k); } }
        }

        // (As fixas já foram lançadas automaticamente acima.)

        // Gasto de ontem acima da média do ciclo
        const daysElapsed = Math.max(1, Math.round((todayDate - start) / dayMs) + 1);
        const avg = expense / daysElapsed;
        const yest = formatDate(new Date(todayDate.getTime() - dayMs));
        const yestExp = Number((await getMonthlySummary(groupId, yest, yest)).total_expense || 0);
        if (avg > 0 && yestExp >= avg * 2 && yestExp >= 30) { const k = `${userId}:highspend:${yest}`; if (!(await seen(k))) { msgs.push(`Ontem gastaste ${eur0(yestExp)} — acima da tua média`); await mark(k); } }

        // Inatividade (≥3 dias sem movimentos)
        const lastRaw = await getLastTransactionDate(groupId).catch(() => null);
        if (lastRaw) {
          const lastIso = lastRaw instanceof Date ? formatDate(lastRaw) : String(lastRaw).slice(0, 10);
          const days = Math.round((todayDate - new Date(lastIso)) / dayMs);
          if (days >= 3) { const k = `${userId}:inactive:${lastIso}`; if (!(await seen(k))) { msgs.push(`Já não registas movimentos há ${days} dias`); await mark(k); } }
        }
      } catch (e) { /* envia o que houver */ }

      if (msgs.length) {
        const body = msgs.slice(0, 4).join(' · ') + (msgs.length > 4 ? ` · +${msgs.length - 4}` : '');
        const r = await push.sendToSubs(userSubs, { title: 'Financeiro', body, url: '/dashboard' });
        totalSent += r.sent;
      }
    }
    return res.json({ ok: true, sent: totalSent });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

// End the web session.
router.post('/logout', (req, res) => {
  if (req.session) return req.session.destroy(() => res.json({ ok: true }));
  return res.json({ ok: true });
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
    const groupId = req.user.finance_group_id;
    const now = new Date();
    const { cycleDay, adjustWeekend } = getUserCycleSettings(req.user);
    const { start, end } = getCyclePeriod(now, cycleDay, adjustWeekend);
    const [budgets, spend] = await Promise.all([
      listBudgets(groupId),
      getExpenseByCategory(groupId, formatDate(start), formatDate(end)),
    ]);
    const spendMap = new Map(spend.map((r) => [Number(r.categoria_id), Number(r.total || 0)]));
    const items = budgets.map((b) => ({ ...b, spent: spendMap.get(Number(b.categoria_id)) || 0 }));
    return res.json({ budgets: items, cycle: { start: formatDate(start), end: formatDate(end) } });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.post('/budgets', apiAuth, async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const { category_id, amount } = req.body || {};
    if (!category_id || !amount) return res.status(400).json({ error: 'missing' });
    await upsertBudget({ groupId, categoryId: Number(category_id), amount: Number(amount) });
    return res.status(201).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.put('/budgets/:id', apiAuth, async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const id = Number(req.params.id);
    const { category_id, amount } = req.body || {};
    if (!id || !category_id || !amount) return res.status(400).json({ error: 'missing' });
    await updateBudget({ groupId, id, categoryId: Number(category_id), amount: Number(amount) });
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
    const type = req.query.type === 'income' || req.query.type === 'expense' ? req.query.type : null;
    const q = req.query.q ? String(req.query.q).trim().slice(0, 80) : null;
    const fromDate = req.query.from ? String(req.query.from) : null;
    const toDate = req.query.to ? String(req.query.to) : null;
    const uncategorized = req.query.uncategorized === '1' || req.query.uncategorized === 'true' ? 1 : 0;
    const offset = (page - 1) * perPage;
    const filter = { groupId, categoryId, type, q, fromDate, toDate, uncategorized };

    const [items, total, summary] = await Promise.all([
      listTransactions({ ...filter, limit: perPage, offset }),
      countTransactions(filter),
      getTransactionsSummary(filter),
    ]);

    return res.json({
      items,
      page,
      per_page: perPage,
      total,
      total_pages: Math.max(1, Math.ceil(total / perPage)),
      summary,
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
      accountId: req.body.account_id ? Number(req.body.account_id) : null,
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
      accountId: req.body.account_id !== undefined ? (req.body.account_id ? Number(req.body.account_id) : null) : undefined,
    });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

// Mudar apenas a categoria (categorização rápida/em massa).
router.put('/transactions/:id/category', apiAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'missing' });
    const cat = req.body && req.body.category_id ? Number(req.body.category_id) : null;
    await updateTransactionCategory(req.user.finance_group_id, id, cat);
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

// ── Contas / carteiras ───────────────────────────────────────────────────
router.get('/accounts', apiAuth, async (req, res) => {
  try {
    const accounts = await listAccounts(req.user.finance_group_id);
    return res.json({ accounts });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.post('/accounts', apiAuth, async (req, res) => {
  try {
    const { nome, cor, icone } = req.body || {};
    if (!nome || !String(nome).trim()) return res.status(400).json({ error: 'missing' });
    const id = await createAccount({ groupId: req.user.finance_group_id, nome: String(nome).trim(), cor, icone });
    return res.status(201).json({ id });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.put('/accounts/:id', apiAuth, async (req, res) => {
  try {
    const { nome, cor, icone, ativo, include_in_total } = req.body || {};
    if (!nome || !String(nome).trim()) return res.status(400).json({ error: 'missing' });
    await updateAccount({ groupId: req.user.finance_group_id, id: Number(req.params.id), nome: String(nome).trim(), cor, icone, ativo: ativo === false ? 0 : 1, includeInTotal: include_in_total === false ? false : true });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.delete('/accounts/:id', apiAuth, async (req, res) => {
  try {
    await deleteAccount(req.user.finance_group_id, Number(req.params.id));
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

// ── Movimentos recorrentes (fixos) ───────────────────────────────────────
router.get('/recurring', apiAuth, async (req, res) => {
  try {
    const rows = await listRecurring(req.user.finance_group_id);
    // Normaliza DATE (objeto Date do mysql2) → 'YYYY-MM-DD' local, evita timezone no cliente.
    const items = rows.map((r) => ({
      ...r,
      proxima_data: r.proxima_data instanceof Date ? formatDate(r.proxima_data) : String(r.proxima_data).slice(0, 10),
    }));
    return res.json({ items, today: formatDate(new Date()) });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.post('/recurring', apiAuth, async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const { tipo, amount, description, category_id, frequencia, intervalo, dia, start_date, ativo } = req.body || {};
    if (!amount || !frequencia) return res.status(400).json({ error: 'missing' });
    const freq = frequencia === 'dias' ? 'dias' : 'mensal';
    const intv = Math.max(1, Number(intervalo) || 1);
    const d = Math.min(28, Math.max(1, Number(dia) || 1));
    const start = start_date ? String(start_date).slice(0, 10) : formatDate(new Date());
    const proximaData = firstOccurrence(freq, intv, d, start);
    const id = await createRecurring({
      groupId, tipo: tipo === 'income' ? 'income' : 'expense', categoryId: category_id || null,
      amount: Number(amount), descricao: description || null, frequencia: freq, intervalo: intv,
      dia: d, proximaData, ativo: ativo === false ? 0 : 1,
      accountId: req.body.account_id ? Number(req.body.account_id) : null,
    });
    return res.status(201).json({ id, proxima_data: proximaData });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.put('/recurring/:id', apiAuth, async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const id = Number(req.params.id);
    const existing = await getRecurringById(groupId, id);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    const { tipo, amount, description, category_id, frequencia, intervalo, dia, start_date, ativo } = req.body || {};
    if (!amount || !frequencia) return res.status(400).json({ error: 'missing' });
    const freq = frequencia === 'dias' ? 'dias' : 'mensal';
    const intv = Math.max(1, Number(intervalo) || 1);
    const d = Math.min(28, Math.max(1, Number(dia) || 1));
    const anchor = start_date
      ? String(start_date).slice(0, 10)
      : (existing.proxima_data instanceof Date ? formatDate(existing.proxima_data) : String(existing.proxima_data).slice(0, 10));
    const proximaData = firstOccurrence(freq, intv, d, anchor);
    await updateRecurring({
      groupId, id, tipo: tipo === 'income' ? 'income' : 'expense', categoryId: category_id || null,
      amount: Number(amount), descricao: description || null, frequencia: freq, intervalo: intv,
      dia: d, proximaData, ativo: ativo === false ? 0 : 1,
      accountId: req.body.account_id ? Number(req.body.account_id) : null,
    });
    return res.json({ ok: true, proxima_data: proximaData });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.delete('/recurring/:id', apiAuth, async (req, res) => {
  try {
    await deleteRecurring(req.user.finance_group_id, Number(req.params.id));
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

// Lança todas as ocorrências em atraso até hoje (apanha 2x/mês p/ 15 em 15).
router.post('/recurring/run', apiAuth, async (req, res) => {
  try {
    const created = await runDueRecurring(req.user.finance_group_id, req.user.id, formatDate(new Date()));
    return res.json({ ok: true, created });
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
    // Tendência por CICLO (não por mês civil): cada barra é um ciclo do utilizador,
    // alinhado ao dia de salário — assim o salário do último dia útil conta no
    // ciclo certo (o "mês" que começa nesse dia), não no mês civil em que cai.
    // Constrói os últimos 6 ciclos (mais antigo → atual).
    const cycles = [];
    {
      let ref = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      for (let i = 0; i < 6; i++) {
        const p = getCyclePeriod(ref, cycleDay, adjustWeekend);
        cycles.unshift(p);
        ref = new Date(p.start.getFullYear(), p.start.getMonth(), p.start.getDate() - 1);
      }
    }
    // Ciclo anterior (para comparação) = penúltimo da lista.
    const prevPeriod = cycles[cycles.length - 2] || getCyclePeriod(new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1), cycleDay, adjustWeekend);

    const [
      summary,
      yearSummary,
      byCategoryRaw,
      goals,
      totalSummary,
      totalAllocated,
      monthlyAllocated,
      savingsTarget,
      prevSummary,
      prevByCategoryRaw,
      recurringPending,
      accounts,
      ...cycleSummaries
    ] = await Promise.all([
      getMonthlySummary(groupId, formatDate(start), formatDate(end)),
      getYearSummary(groupId, formatDate(yearStartDate), formatDate(yearEndDate)),
      getCategoryBreakdown(groupId, formatDate(start), formatDate(end)),
      listGoals(groupId),
      getTotalSummary(groupId),
      getTotalAllocated(groupId),
      getMonthlyAllocated(groupId, formatDate(start), formatDate(end)),
      getMonthlySavingsTarget(groupId),
      getMonthlySummary(groupId, formatDate(prevPeriod.start), formatDate(prevPeriod.end)),
      getCategoryBreakdown(groupId, formatDate(prevPeriod.start), formatDate(prevPeriod.end)),
      countDue(groupId, formatDate(now)),
      listAccounts(groupId).catch(() => []),
      // ...uma soma por ciclo (alinhada ao dia de salário) para a tendência.
      ...cycles.map((c) => getMonthlySummary(groupId, formatDate(c.start), formatDate(c.end))),
    ]);

    // Despesa por categoria (inclui "Sem categoria"), para o donut e os insights.
    const toExpenseCats = (rows) => rows
      .map((r) => ({ categoria_id: r.categoria_id, nome: r.nome, total: Number(r.expense || 0) }))
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);
    const byCategory = toExpenseCats(byCategoryRaw);
    const prevByCategory = toExpenseCats(prevByCategoryRaw);

    // Insights: maiores variações por categoria vs ciclo anterior + ritmo de gastos.
    const curMap = new Map(byCategory.map((r) => [Number(r.categoria_id), { nome: r.nome, total: Number(r.total || 0) }]));
    const prevMap = new Map(prevByCategory.map((r) => [Number(r.categoria_id), { nome: r.nome, total: Number(r.total || 0) }]));
    const moverIds = new Set([...curMap.keys(), ...prevMap.keys()]);
    const movers = [...moverIds].map((id) => {
      const cur = curMap.get(id)?.total || 0;
      const prv = prevMap.get(id)?.total || 0;
      const nome = curMap.get(id)?.nome || prevMap.get(id)?.nome || 'Categoria';
      return { nome, curr: cur, prev: prv, delta: cur - prv };
    }).filter((m) => Math.abs(m.delta) >= 0.01).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 4);

    const dayMs = 86400000;
    const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const daysTotal = Math.max(1, Math.round((end - start) / dayMs) + 1);
    const daysElapsed = Math.min(daysTotal, Math.max(1, Math.round((todayMid - start) / dayMs) + 1));
    const curExpense = Number(summary.total_expense || 0);
    const projectedExpense = (curExpense / daysElapsed) * daysTotal;
    const prevSaved = Number(prevSummary.total_income || 0) - Number(prevSummary.total_expense || 0);

    // Tendência: uma barra por CICLO, rotulada pelo mês predominante (ponto médio).
    const trend = cycles.map((c, i) => {
      const s = cycleSummaries[i] || {};
      const income = Number(s.total_income || 0);
      const expense = Number(s.total_expense || 0);
      const mid = new Date((c.start.getTime() + c.end.getTime()) / 2);
      const key = `${mid.getFullYear()}-${String(mid.getMonth() + 1).padStart(2, '0')}`;
      return { month: key, income, expense, saved: income - expense };
    });

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
      savings: {
        target: Number(savingsTarget || 0),
        // Poupado neste ciclo = receitas − despesas (alocações a objetivos não contam como gasto).
        saved: Number(summary.total_income || 0) - Number(summary.total_expense || 0),
      },
      cycle: {
        start: formatDate(start),
        end: formatDate(end),
      },
      trend,
      accounts: accounts || [],
      recurring: { pending: Number(recurringPending || 0) },
      insights: {
        prev: {
          income: Number(prevSummary.total_income || 0),
          expense: Number(prevSummary.total_expense || 0),
          saved: prevSaved,
        },
        movers,
        pace: { daysElapsed, daysTotal, projectedExpense, currentExpense: curExpense },
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

// ── Estatísticas (comparar ciclos) ───────────────────────────────────────
function buildCyclesBack(now, cycleDay, adjustWeekend, n) {
  const cycles = [];
  let ref = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; i < n; i++) {
    const p = getCyclePeriod(ref, cycleDay, adjustWeekend);
    cycles.unshift(p);
    ref = new Date(p.start.getFullYear(), p.start.getMonth(), p.start.getDate() - 1);
  }
  return cycles; // oldest → newest (last = current)
}
function cycleLabel(c) {
  const mid = new Date((c.start.getTime() + c.end.getTime()) / 2);
  return `${mid.getFullYear()}-${String(mid.getMonth() + 1).padStart(2, '0')}`;
}

// Série de N ciclos (default 12) para o gráfico/seletor.
router.get('/stats/series', apiAuth, async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const { cycleDay, adjustWeekend } = getUserCycleSettings(req.user);
    const n = Math.min(24, Math.max(3, Number(req.query.n) || 12));
    const cycles = buildCyclesBack(new Date(), cycleDay, adjustWeekend, n);
    const sums = await Promise.all(cycles.map((c) => getMonthlySummary(groupId, formatDate(c.start), formatDate(c.end))));
    const out = cycles.map((c, i) => {
      const income = Number(sums[i].total_income || 0);
      const expense = Number(sums[i].total_expense || 0);
      return { offset: cycles.length - 1 - i, label: cycleLabel(c), start: formatDate(c.start), end: formatDate(c.end), income, expense, saved: income - expense };
    });
    return res.json({ cycles: out });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

// Detalhe de um ciclo (offset 0 = atual, 1 = anterior, …): KPIs + categorias + top despesas.
router.get('/stats/cycle', apiAuth, async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const { cycleDay, adjustWeekend } = getUserCycleSettings(req.user);
    const offset = Math.max(0, Math.min(60, Number(req.query.offset) || 0));
    let ref = new Date();
    ref = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    let cur = getCyclePeriod(ref, cycleDay, adjustWeekend);
    for (let i = 0; i < offset; i++) {
      ref = new Date(cur.start.getFullYear(), cur.start.getMonth(), cur.start.getDate() - 1);
      cur = getCyclePeriod(ref, cycleDay, adjustWeekend);
    }
    const prevRef = new Date(cur.start.getFullYear(), cur.start.getMonth(), cur.start.getDate() - 1);
    const prev = getCyclePeriod(prevRef, cycleDay, adjustWeekend);
    const [sum, prevSum, breakdown, expenseTx] = await Promise.all([
      getMonthlySummary(groupId, formatDate(cur.start), formatDate(cur.end)),
      getMonthlySummary(groupId, formatDate(prev.start), formatDate(prev.end)),
      getCategoryBreakdown(groupId, formatDate(cur.start), formatDate(cur.end)),
      listTransactionsForReport({ groupId, fromDate: formatDate(cur.start), toDate: formatDate(cur.end), type: 'expense' }),
    ]);
    const income = Number(sum.total_income || 0);
    const expense = Number(sum.total_expense || 0);
    const prevExpense = Number(prevSum.total_expense || 0);
    const prevSaved = Number(prevSum.total_income || 0) - prevExpense;
    const byCategory = breakdown
      .map((r) => ({ nome: r.nome, tipo: r.tipo, expense: Number(r.expense || 0), income: Number(r.income || 0) }))
      .filter((r) => r.expense > 0)
      .sort((a, b) => b.expense - a.expense);
    const sorted = (expenseTx || [])
      .map((t) => ({ descricao: t.descricao, categoria: t.categoria_nome, valor: Number(t.valor), data: t.data_ocorrencia }))
      .sort((a, b) => b.valor - a.valor);
    const topExpenses = sorted.slice(0, 6);
    const days = Math.max(1, Math.round((cur.end - cur.start) / 86400000) + 1);
    return res.json({
      period: { offset, start: formatDate(cur.start), end: formatDate(cur.end), label: cycleLabel(cur), days },
      summary: {
        income, expense, saved: income - expense,
        rate: income > 0 ? Math.round(((income - expense) / income) * 100) : 0,
        count: sorted.length,
        avgPerDay: expense / days,
        biggest: sorted.length ? sorted[0].valor : 0,
      },
      prev: { saved: prevSaved, expense: prevExpense },
      byCategory,
      topExpenses,
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

// Gastar dinheiro de um objetivo: cria a DESPESA real e LIBERTA a reserva
// (alocação negativa), para o valor não ser descontado duas vezes ao disponível.
router.post('/goals/:id/spend', apiAuth, async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const goalId = Number(req.params.id);
    const { amount, date, category_id, account_id, description } = req.body || {};
    const goal = await getGoalById(groupId, goalId);
    if (!goal) return res.status(404).json({ error: 'not_found' });
    const allocated = await getGoalAllocatedTotal(groupId, goalId);
    let amt = Number(amount);
    if (!amt || amt <= 0) amt = allocated; // por defeito gasta tudo o que está alocado
    if (!amt || amt <= 0) return res.status(400).json({ error: 'missing' });
    const when = date ? String(date).slice(0, 10) : formatDate(new Date());
    // 1) despesa real
    await createTransaction({
      groupId,
      userId: req.user.id,
      type: 'expense',
      categoryId: category_id ? Number(category_id) : null,
      amount: amt,
      occurredOn: when,
      description: description ? String(description).trim() : `Objetivo: ${goal.nome}`,
      source: 'objetivo',
      accountId: account_id ? Number(account_id) : null,
    });
    // 2) liberta a reserva (até ao que estava alocado)
    const release = Math.min(amt, allocated);
    if (release > 0) {
      await addAllocation({ groupId, goalId, userId: req.user.id, amount: -release, date: when, note: 'Gasto do objetivo' });
    }
    // 3) estado — se gastou tudo o que estava alocado, arquiva (fecha o objetivo).
    const newAllocated = allocated - release;
    let status;
    if (newAllocated <= 0.005) status = 'archived';
    else status = goal.valor_objetivo && newAllocated >= Number(goal.valor_objetivo) ? 'completed' : 'active';
    await updateGoalStatus(groupId, goalId, status);
    return res.status(201).json({ ok: true, archived: status === 'archived' });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

// Desarquivar um objetivo (volta a ativo/concluído consoante o alocado).
router.post('/goals/:id/unarchive', apiAuth, async (req, res) => {
  try {
    const groupId = req.user.finance_group_id;
    const id = Number(req.params.id);
    const goal = await getGoalById(groupId, id);
    if (!goal) return res.status(404).json({ error: 'not_found' });
    const allocated = await getGoalAllocatedTotal(groupId, id);
    const status = goal.valor_objetivo && allocated >= Number(goal.valor_objetivo) ? 'completed' : 'active';
    await updateGoalStatus(groupId, id, status);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

// ── Exportar / backup ─────────────────────────────────────────────────────
router.get('/export/transactions.csv', apiAuth, async (req, res) => {
  try {
    const rows = await listTransactionsForReport({ groupId: req.user.finance_group_id });
    const esc = (v) => { const s = v == null ? '' : String(v); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = ['Data;Tipo;Valor;Categoria;Descrição;Fonte'];
    for (const t of rows) {
      const data = t.data_ocorrencia instanceof Date ? formatDate(t.data_ocorrencia) : String(t.data_ocorrencia).slice(0, 10);
      const tipo = t.tipo === 'income' ? 'Receita' : 'Despesa';
      const valor = Number(t.valor || 0).toFixed(2).replace('.', ',');
      lines.push([data, tipo, valor, esc(t.categoria_nome || ''), esc(t.descricao || ''), esc(t.fonte || '')].join(';'));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="financeiro-movimentos.csv"');
    return res.send(String.fromCharCode(0xFEFF) + lines.join('\r\n'));
  } catch (err) {
    return res.status(500).json({ error: 'server' });
  }
});

router.get('/export/backup.json', apiAuth, async (req, res) => {
  try {
    const g = req.user.finance_group_id;
    const [categories, budgets, goals, allocations, accounts, recurring, transactions] = await Promise.all([
      listCategories(g),
      listBudgets(g),
      listGoals(g),
      listAllocations(g, 100000),
      listAccounts(g).catch(() => []),
      listRecurring(g).catch(() => []),
      listTransactionsForReport({ groupId: g }),
    ]);
    const data = { exported_at: new Date().toISOString(), finance_group_id: g, categories, accounts, budgets, goals, allocations, recurring, transactions };
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="financeiro-backup.json"');
    return res.send(JSON.stringify(data, null, 2));
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

const pool = require('../config/db');
const { accountsHaveColumn, getDefaultAccountId } = require('./financeAccountModel');

// Idempotência: evita duplicados quando a sync offline reenvia o mesmo pedido.
let idemReady = false;
async function ensureIdem() {
  if (idemReady) return;
  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS finance_idempotency (
         client_uid VARCHAR(64) NOT NULL PRIMARY KEY,
         tx_id INT NOT NULL,
         finance_group_id INT NOT NULL,
         data_criado TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    idemReady = true;
  } catch (e) { /* sem privilégio → idempotência desativada */ }
}
async function getIdempotent(uid) {
  try { await ensureIdem(); const [r] = await pool.query('SELECT tx_id FROM finance_idempotency WHERE client_uid = ?', [uid]); return r[0] ? r[0].tx_id : null; }
  catch (e) { return null; }
}
async function recordIdempotent(uid, groupId, txId) {
  try { await ensureIdem(); await pool.query('INSERT IGNORE INTO finance_idempotency (client_uid, tx_id, finance_group_id) VALUES (?, ?, ?)', [uid, txId, groupId]); }
  catch (e) { /* */ }
}

async function createTransaction({ groupId, userId, type, categoryId, amount, occurredOn, description, source, accountId, clientUid }) {
  if (clientUid) { const dup = await getIdempotent(clientUid); if (dup) return dup; }
  if (accountsHaveColumn()) {
    let acctId = accountId;
    if (!acctId) { try { acctId = await getDefaultAccountId(groupId); } catch (e) { acctId = null; } }
    const [result] = await pool.query(
      `INSERT INTO finance_transactions
       (finance_group_id, user_id, tipo, categoria_id, valor, data_ocorrencia, descricao, fonte, account_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [groupId, userId, type, categoryId || null, amount, occurredOn, description || null, source || null, acctId || null]
    );
    if (clientUid) await recordIdempotent(clientUid, groupId, result.insertId);
    return result.insertId;
  }
  const [result] = await pool.query(
    `INSERT INTO finance_transactions
     (finance_group_id, user_id, tipo, categoria_id, valor, data_ocorrencia, descricao, fonte, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    [groupId, userId, type, categoryId || null, amount, occurredOn, description || null, source || null]
  );
  if (clientUid) await recordIdempotent(clientUid, groupId, result.insertId);
  return result.insertId;
}

async function listRecentTransactions(groupId, limit = 20) {
  const [rows] = await pool.query(
    `SELECT t.id, t.tipo, t.valor, t.data_ocorrencia, t.descricao, t.fonte,
        c.nome AS categoria_nome,
        d.id AS document_id,
        d.original_name AS document_name,
        d.mime_type AS document_mime
     FROM finance_transactions t
     LEFT JOIN finance_categories c ON c.id = t.categoria_id
     LEFT JOIN finance_documents d ON d.transaction_id = t.id
     WHERE t.finance_group_id = ? AND t.status = 'active'
     ORDER BY t.data_ocorrencia DESC, t.id DESC
     LIMIT ?`,
    [groupId, limit]
  );
  return rows;
}

// Shared WHERE builder for the movimentos list/count/summary (aliased `t`).
function buildTxFilter({ groupId, categoryId, type, q, fromDate, toDate, uncategorized }) {
  const params = [groupId];
  let where = "t.finance_group_id = ? AND t.status = 'active'";
  if (uncategorized) { where += ' AND t.categoria_id IS NULL'; }
  else if (categoryId) { where += ' AND t.categoria_id = ?'; params.push(categoryId); }
  if (type === 'income' || type === 'expense') { where += ' AND t.tipo = ?'; params.push(type); }
  if (q) { where += ' AND (t.descricao LIKE ? OR t.fonte LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  if (fromDate) { where += ' AND t.data_ocorrencia >= ?'; params.push(fromDate); }
  if (toDate) { where += ' AND t.data_ocorrencia <= ?'; params.push(toDate); }
  return { where, params };
}

async function listTransactions(opts) {
  const { where, params } = buildTxFilter(opts);
  params.push(opts.limit, opts.offset);
  const acc = accountsHaveColumn();
  const accSelect = acc ? ', t.account_id, ac.nome AS account_nome, ac.cor AS account_cor' : '';
  const accJoin = acc ? 'LEFT JOIN finance_accounts ac ON ac.id = t.account_id' : '';
  const [rows] = await pool.query(
    `SELECT t.id, t.tipo, t.valor, t.data_ocorrencia, t.descricao, t.fonte, t.categoria_id,
        c.nome AS categoria_nome,
        d.id AS document_id,
        d.original_name AS document_name,
        d.mime_type AS document_mime${accSelect}
     FROM finance_transactions t
     LEFT JOIN finance_categories c ON c.id = t.categoria_id
     LEFT JOIN finance_documents d ON d.transaction_id = t.id
     ${accJoin}
     WHERE ${where}
     ORDER BY t.data_ocorrencia DESC, t.id DESC
     LIMIT ? OFFSET ?`,
    params
  );
  return rows;
}

async function countTransactions(opts) {
  const { where, params } = buildTxFilter(opts);
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total FROM finance_transactions t WHERE ${where}`,
    params
  );
  return rows[0] ? Number(rows[0].total || 0) : 0;
}

// Income/expense totals for the SAME filter (whole result set, not just a page).
async function getTransactionsSummary(opts) {
  const { where, params } = buildTxFilter(opts);
  const [rows] = await pool.query(
    `SELECT
        SUM(CASE WHEN t.tipo = 'income' THEN t.valor ELSE 0 END) AS total_income,
        SUM(CASE WHEN t.tipo = 'expense' THEN t.valor ELSE 0 END) AS total_expense
     FROM finance_transactions t WHERE ${where}`,
    params
  );
  return {
    income: Number(rows[0]?.total_income || 0),
    expense: Number(rows[0]?.total_expense || 0),
  };
}

async function getMonthlySummary(groupId, monthStart, monthEnd) {
  const [rows] = await pool.query(
    `SELECT
        SUM(CASE WHEN tipo = 'income' THEN valor ELSE 0 END) AS total_income,
        SUM(CASE WHEN tipo = 'expense' THEN valor ELSE 0 END) AS total_expense
     FROM finance_transactions
     WHERE finance_group_id = ? AND status = 'active' AND data_ocorrencia BETWEEN ? AND ?`,
    [groupId, monthStart, monthEnd]
  );
  return rows[0] || { total_income: 0, total_expense: 0 };
}

async function getExpenseByCategory(groupId, monthStart, monthEnd) {
  const [rows] = await pool.query(
    `SELECT c.id AS categoria_id, c.nome, SUM(t.valor) AS total
     FROM finance_transactions t
     INNER JOIN finance_categories c ON c.id = t.categoria_id
     WHERE t.finance_group_id = ?
       AND t.tipo = 'expense'
       AND t.status = 'active'
       AND t.data_ocorrencia BETWEEN ? AND ?
     GROUP BY c.id, c.nome
     ORDER BY total DESC`,
    [groupId, monthStart, monthEnd]
  );
  return rows;
}

// Detalhe por categoria (despesa + receita) num intervalo — para estatísticas.
// onlyMain: exclui contas restritas (include_in_total=0, ex.: cartão refeição)
// para que "Onde gastaste" reflita só o dinheiro real.
async function getCategoryBreakdown(groupId, start, end, { onlyMain = false } = {}) {
  const restrict = onlyMain && accountsHaveColumn()
    ? 'AND COALESCE(a.include_in_total, 1) = 1'
    : '';
  const join = onlyMain && accountsHaveColumn()
    ? 'LEFT JOIN finance_accounts a ON a.id = t.account_id'
    : '';
  const [rows] = await pool.query(
    `SELECT t.categoria_id, COALESCE(c.nome, 'Sem categoria') AS nome, c.tipo,
        SUM(CASE WHEN t.tipo = 'expense' THEN t.valor ELSE 0 END) AS expense,
        SUM(CASE WHEN t.tipo = 'income' THEN t.valor ELSE 0 END) AS income
     FROM finance_transactions t
     LEFT JOIN finance_categories c ON c.id = t.categoria_id
     ${join}
     WHERE t.finance_group_id = ? AND t.status = 'active'
       AND t.data_ocorrencia BETWEEN ? AND ?
       ${restrict}
     GROUP BY t.categoria_id, nome, c.tipo`,
    [groupId, start, end]
  );
  return rows;
}

// Resumo do ciclo separado por tipo de conta: `main` (contas reais, incluídas no
// total, + movimentos sem conta) vs `restricted` (cartão refeição / contas
// separadas). Assim a poupança "real" não é inflacionada pelo carregamento do
// cartão. Se a coluna de contas não existir, tudo cai em `main`.
async function getMonthlySummarySplit(groupId, start, end) {
  const empty = () => ({ income: 0, expense: 0 });
  if (!accountsHaveColumn()) {
    const s = await getMonthlySummary(groupId, start, end);
    return { main: { income: Number(s.total_income || 0), expense: Number(s.total_expense || 0) }, restricted: empty() };
  }
  const [rows] = await pool.query(
    `SELECT COALESCE(a.include_in_total, 1) AS inc,
        SUM(CASE WHEN t.tipo = 'income' THEN t.valor ELSE 0 END) AS income,
        SUM(CASE WHEN t.tipo = 'expense' THEN t.valor ELSE 0 END) AS expense
     FROM finance_transactions t
     LEFT JOIN finance_accounts a ON a.id = t.account_id
     WHERE t.finance_group_id = ? AND t.status = 'active'
       AND t.data_ocorrencia BETWEEN ? AND ?
     GROUP BY COALESCE(a.include_in_total, 1)`,
    [groupId, start, end]
  );
  const main = empty();
  const restricted = empty();
  for (const r of rows) {
    const bucket = Number(r.inc) === 0 ? restricted : main;
    bucket.income += Number(r.income || 0);
    bucket.expense += Number(r.expense || 0);
  }
  return { main, restricted };
}

async function getYearSummary(groupId, yearStart, yearEnd) {
  const [rows] = await pool.query(
    `SELECT
        SUM(CASE WHEN tipo = 'income' THEN valor ELSE 0 END) AS total_income,
        SUM(CASE WHEN tipo = 'expense' THEN valor ELSE 0 END) AS total_expense
     FROM finance_transactions
     WHERE finance_group_id = ? AND status = 'active' AND data_ocorrencia BETWEEN ? AND ?`,
    [groupId, yearStart, yearEnd]
  );
  return rows[0] || { total_income: 0, total_expense: 0 };
}

async function updateTransactionCategory(groupId, id, categoryId) {
  await pool.query(
    'UPDATE finance_transactions SET categoria_id = ? WHERE finance_group_id = ? AND id = ?',
    [categoryId || null, groupId, id]
  );
}

async function getLastTransactionDate(groupId) {
  const [rows] = await pool.query(
    `SELECT MAX(data_ocorrencia) AS last FROM finance_transactions
     WHERE finance_group_id = ? AND status = 'active'`,
    [groupId]
  );
  return rows[0] ? rows[0].last : null;
}

async function getTotalSummary(groupId) {
  const [rows] = await pool.query(
    `SELECT
        SUM(CASE WHEN tipo = 'income' THEN valor ELSE 0 END) AS total_income,
        SUM(CASE WHEN tipo = 'expense' THEN valor ELSE 0 END) AS total_expense
     FROM finance_transactions
     WHERE finance_group_id = ? AND status = 'active'`,
    [groupId]
  );
  return rows[0] || { total_income: 0, total_expense: 0 };
}

async function getMonthlySeries(groupId, fromDate, toDate) {
  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(data_ocorrencia, '%Y-%m-01') AS mes,
        SUM(CASE WHEN tipo = 'income' THEN valor ELSE 0 END) AS total_income,
        SUM(CASE WHEN tipo = 'expense' THEN valor ELSE 0 END) AS total_expense
     FROM finance_transactions
     WHERE finance_group_id = ? AND status = 'active' AND data_ocorrencia BETWEEN ? AND ?
     GROUP BY mes
     ORDER BY mes ASC`,
    [groupId, fromDate, toDate]
  );
  return rows;
}

async function listTransactionsForReport({ groupId, fromDate, toDate, type, onlyMain = false }) {
  const params = [groupId];
  let where = 't.finance_group_id = ? AND t.status = \'active\'';
  if (type) {
    where += ' AND t.tipo = ?';
    params.push(type);
  }
  if (fromDate) {
    where += ' AND t.data_ocorrencia >= ?';
    params.push(fromDate);
  }
  if (toDate) {
    where += ' AND t.data_ocorrencia <= ?';
    params.push(toDate);
  }
  const withAcc = onlyMain && accountsHaveColumn();
  const join = withAcc ? 'LEFT JOIN finance_accounts a ON a.id = t.account_id' : '';
  if (withAcc) where += ' AND COALESCE(a.include_in_total, 1) = 1';
  const [rows] = await pool.query(
    `SELECT t.id, t.tipo, t.valor, t.data_ocorrencia, t.descricao, t.fonte,
        c.nome AS categoria_nome
     FROM finance_transactions t
     LEFT JOIN finance_categories c ON c.id = t.categoria_id
     ${join}
     WHERE ${where}
     ORDER BY t.data_ocorrencia DESC, t.id DESC`,
    params
  );
  return rows;
}

async function getTransactionById(groupId, id) {
  const [rows] = await pool.query(
    `SELECT id, tipo, valor, data_ocorrencia, descricao, categoria_id
     FROM finance_transactions
     WHERE finance_group_id = ? AND id = ?`,
    [groupId, id]
  );
  return rows[0] || null;
}

async function updateTransaction({ groupId, id, type, categoryId, amount, occurredOn, description, accountId }) {
  if (accountsHaveColumn() && accountId !== undefined) {
    await pool.query(
      `UPDATE finance_transactions
       SET tipo = ?, categoria_id = ?, valor = ?, data_ocorrencia = ?, descricao = ?, account_id = ?
       WHERE finance_group_id = ? AND id = ?`,
      [type, categoryId || null, amount, occurredOn, description || null, accountId || null, groupId, id]
    );
    return;
  }
  await pool.query(
    `UPDATE finance_transactions
     SET tipo = ?, categoria_id = ?, valor = ?, data_ocorrencia = ?, descricao = ?
     WHERE finance_group_id = ? AND id = ?`,
    [type, categoryId || null, amount, occurredOn, description || null, groupId, id]
  );
}

async function voidTransaction(groupId, id) {
  await pool.query(
    `UPDATE finance_transactions SET status = 'void' WHERE finance_group_id = ? AND id = ?`,
    [groupId, id]
  );
}

async function deleteTransaction(groupId, id) {
  await pool.query(
    `DELETE FROM finance_transactions WHERE finance_group_id = ? AND id = ?`,
    [groupId, id]
  );
}

module.exports = {
  createTransaction,
  listRecentTransactions,
  listTransactions,
  countTransactions,
  getMonthlySummary,
  getMonthlySummarySplit,
  getYearSummary,
  getTotalSummary,
  getLastTransactionDate,
  updateTransactionCategory,
  getExpenseByCategory,
  getCategoryBreakdown,
  getTransactionsSummary,
  getMonthlySeries,
  listTransactionsForReport,
  getTransactionById,
  updateTransaction,
  voidTransaction,
  deleteTransaction,
};

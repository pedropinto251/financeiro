const pool = require('../config/db');
const { accountsHaveColumn, getDefaultAccountId } = require('./financeAccountModel');

async function createTransaction({ groupId, userId, type, categoryId, amount, occurredOn, description, source, accountId }) {
  if (accountsHaveColumn()) {
    let acctId = accountId;
    if (!acctId) { try { acctId = await getDefaultAccountId(groupId); } catch (e) { acctId = null; } }
    const [result] = await pool.query(
      `INSERT INTO finance_transactions
       (finance_group_id, user_id, tipo, categoria_id, valor, data_ocorrencia, descricao, fonte, account_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [groupId, userId, type, categoryId || null, amount, occurredOn, description || null, source || null, acctId || null]
    );
    return result.insertId;
  }
  const [result] = await pool.query(
    `INSERT INTO finance_transactions
     (finance_group_id, user_id, tipo, categoria_id, valor, data_ocorrencia, descricao, fonte, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    [groupId, userId, type, categoryId || null, amount, occurredOn, description || null, source || null]
  );
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
function buildTxFilter({ groupId, categoryId, type, q, fromDate, toDate }) {
  const params = [groupId];
  let where = "t.finance_group_id = ? AND t.status = 'active'";
  if (categoryId) { where += ' AND t.categoria_id = ?'; params.push(categoryId); }
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
async function getCategoryBreakdown(groupId, start, end) {
  const [rows] = await pool.query(
    `SELECT t.categoria_id, COALESCE(c.nome, 'Sem categoria') AS nome, c.tipo,
        SUM(CASE WHEN t.tipo = 'expense' THEN t.valor ELSE 0 END) AS expense,
        SUM(CASE WHEN t.tipo = 'income' THEN t.valor ELSE 0 END) AS income
     FROM finance_transactions t
     LEFT JOIN finance_categories c ON c.id = t.categoria_id
     WHERE t.finance_group_id = ? AND t.status = 'active'
       AND t.data_ocorrencia BETWEEN ? AND ?
     GROUP BY t.categoria_id, nome, c.tipo`,
    [groupId, start, end]
  );
  return rows;
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

async function listTransactionsForReport({ groupId, fromDate, toDate, type }) {
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
  const [rows] = await pool.query(
    `SELECT t.id, t.tipo, t.valor, t.data_ocorrencia, t.descricao, t.fonte,
        c.nome AS categoria_nome
     FROM finance_transactions t
     LEFT JOIN finance_categories c ON c.id = t.categoria_id
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
  getYearSummary,
  getTotalSummary,
  getLastTransactionDate,
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

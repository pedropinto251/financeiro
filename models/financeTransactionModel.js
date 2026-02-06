const pool = require('../config/db');

async function createTransaction({ groupId, userId, type, categoryId, amount, occurredOn, description, source }) {
  const [result] = await pool.query(
    `INSERT INTO finance_transactions
     (finance_group_id, user_id, tipo, categoria_id, valor, data_ocorrencia, descricao, fonte)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [groupId, userId, type, categoryId || null, amount, occurredOn, description || null, source || null]
  );
  return result.insertId;
}

async function listRecentTransactions(groupId, limit = 20) {
  const [rows] = await pool.query(
    `SELECT t.id, t.tipo, t.valor, t.data_ocorrencia, t.descricao, t.fonte,
        c.nome AS categoria_nome,
        d.id AS document_id
     FROM finance_transactions t
     LEFT JOIN finance_categories c ON c.id = t.categoria_id
     LEFT JOIN finance_documents d ON d.transaction_id = t.id
     WHERE t.finance_group_id = ?
     ORDER BY t.data_ocorrencia DESC, t.id DESC
     LIMIT ?`,
    [groupId, limit]
  );
  return rows;
}

async function getMonthlySummary(groupId, monthStart, monthEnd) {
  const [rows] = await pool.query(
    `SELECT
        SUM(CASE WHEN tipo = 'income' THEN valor ELSE 0 END) AS total_income,
        SUM(CASE WHEN tipo = 'expense' THEN valor ELSE 0 END) AS total_expense
     FROM finance_transactions
     WHERE finance_group_id = ? AND data_ocorrencia BETWEEN ? AND ?`,
    [groupId, monthStart, monthEnd]
  );
  return rows[0] || { total_income: 0, total_expense: 0 };
}

async function getExpenseByCategory(groupId, monthStart, monthEnd) {
  const [rows] = await pool.query(
    `SELECT c.nome, SUM(t.valor) AS total
     FROM finance_transactions t
     INNER JOIN finance_categories c ON c.id = t.categoria_id
     WHERE t.finance_group_id = ?
       AND t.tipo = 'expense'
       AND t.data_ocorrencia BETWEEN ? AND ?
     GROUP BY c.id
     ORDER BY total DESC`,
    [groupId, monthStart, monthEnd]
  );
  return rows;
}

async function getMonthlySeries(groupId, fromDate, toDate) {
  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(data_ocorrencia, '%Y-%m-01') AS mes,
        SUM(CASE WHEN tipo = 'income' THEN valor ELSE 0 END) AS total_income,
        SUM(CASE WHEN tipo = 'expense' THEN valor ELSE 0 END) AS total_expense
     FROM finance_transactions
     WHERE finance_group_id = ? AND data_ocorrencia BETWEEN ? AND ?
     GROUP BY mes
     ORDER BY mes ASC`,
    [groupId, fromDate, toDate]
  );
  return rows;
}

module.exports = {
  createTransaction,
  listRecentTransactions,
  getMonthlySummary,
  getExpenseByCategory,
  getMonthlySeries,
};

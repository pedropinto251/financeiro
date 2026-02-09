const pool = require('../config/db');

async function listBudgets(groupId) {
  const [rows] = await pool.query(
    `SELECT b.id, b.mes, b.valor, b.categoria_id, c.nome AS categoria_nome, c.tipo
     FROM finance_budgets b
     INNER JOIN finance_categories c ON c.id = b.categoria_id
     WHERE b.finance_group_id = ?
     ORDER BY b.mes DESC, c.nome`,
    [groupId]
  );
  return rows;
}

async function upsertBudget({ groupId, categoryId, month, amount }) {
  await pool.query(
    `INSERT INTO finance_budgets (finance_group_id, categoria_id, mes, valor)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
    [groupId, categoryId, month, amount]
  );
}

async function updateBudget({ groupId, id, categoryId, month, amount }) {
  await pool.query(
    `UPDATE finance_budgets
     SET categoria_id = ?, mes = ?, valor = ?
     WHERE finance_group_id = ? AND id = ?`,
    [categoryId, month, amount, groupId, id]
  );
}

async function deleteBudget(groupId, id) {
  await pool.query(
    `DELETE FROM finance_budgets WHERE finance_group_id = ? AND id = ?`,
    [groupId, id]
  );
}

module.exports = {
  listBudgets,
  upsertBudget,
  updateBudget,
  deleteBudget,
};

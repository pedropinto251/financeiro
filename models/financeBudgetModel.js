const pool = require('../config/db');

async function listBudgets(groupId) {
  const [rows] = await pool.query(
    `SELECT b.id, b.mes, b.valor, c.nome AS categoria_nome, c.tipo
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

module.exports = {
  listBudgets,
  upsertBudget,
};

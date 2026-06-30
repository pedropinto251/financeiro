const pool = require('../config/db');

// Budgets recorrentes: aplicam-se a todos os meses (não a um mês específico).
// Para evitar migração, o `mes` guarda uma data sentinela constante, o que torna
// o budget único por categoria via a UNIQUE KEY (grupo, categoria, mes).
const RECURRING_MONTH = '2000-01-01';

async function listBudgets(groupId) {
  const [rows] = await pool.query(
    `SELECT b.id, b.valor, b.categoria_id, c.nome AS categoria_nome, c.tipo
     FROM finance_budgets b
     INNER JOIN finance_categories c ON c.id = b.categoria_id
     WHERE b.finance_group_id = ? AND b.mes = ?
     ORDER BY c.nome`,
    [groupId, RECURRING_MONTH]
  );
  return rows;
}

async function upsertBudget({ groupId, categoryId, amount }) {
  await pool.query(
    `INSERT INTO finance_budgets (finance_group_id, categoria_id, mes, valor)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
    [groupId, categoryId, RECURRING_MONTH, amount]
  );
}

async function updateBudget({ groupId, id, categoryId, amount }) {
  await pool.query(
    `UPDATE finance_budgets
     SET categoria_id = ?, valor = ?
     WHERE finance_group_id = ? AND id = ?`,
    [categoryId, amount, groupId, id]
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
  RECURRING_MONTH,
};

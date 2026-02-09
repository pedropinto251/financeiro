const pool = require('../config/db');

async function listGoals(groupId) {
  const [rows] = await pool.query(
    `SELECT g.id, g.nome, g.valor_objetivo, g.data_objetivo, g.estado,
        COALESCE(SUM(a.valor), 0) AS total_alocado
     FROM finance_goals g
     LEFT JOIN finance_goal_allocations a ON a.goal_id = g.id
     WHERE g.finance_group_id = ?
     GROUP BY g.id
     ORDER BY g.data_criado DESC`,
    [groupId]
  );
  return rows;
}

async function createGoal({ groupId, name, targetAmount, targetDate }) {
  const [result] = await pool.query(
    `INSERT INTO finance_goals (finance_group_id, nome, valor_objetivo, data_objetivo)
     VALUES (?, ?, ?, ?)`,
    [groupId, name, targetAmount, targetDate || null]
  );
  return result.insertId;
}

async function getGoalById(groupId, id) {
  const [rows] = await pool.query(
    `SELECT id, nome, valor_objetivo, data_objetivo, estado
     FROM finance_goals
     WHERE finance_group_id = ? AND id = ?`,
    [groupId, id]
  );
  return rows[0] || null;
}

async function addAllocation({ groupId, goalId, userId, amount, date, note }) {
  await pool.query(
    `INSERT INTO finance_goal_allocations
     (finance_group_id, goal_id, user_id, valor, data_alocacao, nota)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [groupId, goalId, userId, amount, date, note || null]
  );
}

async function listAllocations(groupId, limit = 50) {
  const [rows] = await pool.query(
    `SELECT a.id, a.goal_id, a.valor, a.data_alocacao, a.nota,
        g.nome AS goal_nome
     FROM finance_goal_allocations a
     INNER JOIN finance_goals g ON g.id = a.goal_id
     WHERE a.finance_group_id = ?
     ORDER BY a.data_alocacao DESC, a.id DESC
     LIMIT ?`,
    [groupId, limit]
  );
  return rows;
}

async function getAllocationById(groupId, id) {
  const [rows] = await pool.query(
    `SELECT id, goal_id, valor, data_alocacao, nota
     FROM finance_goal_allocations
     WHERE finance_group_id = ? AND id = ?`,
    [groupId, id]
  );
  return rows[0] || null;
}

async function updateAllocation({ groupId, id, goalId, amount, date, note }) {
  await pool.query(
    `UPDATE finance_goal_allocations
     SET goal_id = ?, valor = ?, data_alocacao = ?, nota = ?
     WHERE finance_group_id = ? AND id = ?`,
    [goalId, amount, date, note || null, groupId, id]
  );
}

async function deleteAllocation(groupId, id) {
  await pool.query(
    `DELETE FROM finance_goal_allocations WHERE finance_group_id = ? AND id = ?`,
    [groupId, id]
  );
}

async function getGoalAllocatedTotal(groupId, goalId) {
  const [rows] = await pool.query(
    `SELECT COALESCE(SUM(valor), 0) AS total
     FROM finance_goal_allocations
     WHERE finance_group_id = ? AND goal_id = ?`,
    [groupId, goalId]
  );
  return rows[0] ? Number(rows[0].total || 0) : 0;
}

async function getTotalAllocated(groupId) {
  const [rows] = await pool.query(
    `SELECT COALESCE(SUM(valor), 0) AS total
     FROM finance_goal_allocations
     WHERE finance_group_id = ?`,
    [groupId]
  );
  return rows[0] ? Number(rows[0].total || 0) : 0;
}

async function getMonthlyAllocated(groupId, monthStart, monthEnd) {
  const [rows] = await pool.query(
    `SELECT COALESCE(SUM(valor), 0) AS total
     FROM finance_goal_allocations
     WHERE finance_group_id = ?
       AND data_alocacao BETWEEN ? AND ?`,
    [groupId, monthStart, monthEnd]
  );
  return rows[0] ? Number(rows[0].total || 0) : 0;
}

async function updateGoalStatus(groupId, goalId, status) {
  await pool.query(
    `UPDATE finance_goals SET estado = ? WHERE finance_group_id = ? AND id = ?`,
    [status, groupId, goalId]
  );
}

async function updateGoal({ groupId, id, name, targetAmount, targetDate }) {
  await pool.query(
    `UPDATE finance_goals
     SET nome = ?, valor_objetivo = ?, data_objetivo = ?
     WHERE finance_group_id = ? AND id = ?`,
    [name, targetAmount, targetDate || null, groupId, id]
  );
}

async function deleteGoal(groupId, id) {
  await pool.query(
    `DELETE FROM finance_goals WHERE finance_group_id = ? AND id = ?`,
    [groupId, id]
  );
}

module.exports = {
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
};

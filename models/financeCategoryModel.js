const pool = require('../config/db');

async function listCategories(groupId) {
  const [rows] = await pool.query(
    `SELECT id, nome, tipo
     FROM finance_categories
     WHERE finance_group_id = ?
     ORDER BY tipo, nome`,
    [groupId]
  );
  return rows;
}

async function createCategory({ groupId, name, type }) {
  const [result] = await pool.query(
    `INSERT INTO finance_categories (finance_group_id, nome, tipo)
     VALUES (?, ?, ?)`,
    [groupId, name, type]
  );
  return result.insertId;
}

module.exports = {
  listCategories,
  createCategory,
};

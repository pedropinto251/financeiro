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

async function updateCategory({ groupId, id, name, type }) {
  await pool.query(
    `UPDATE finance_categories
     SET nome = ?, tipo = ?
     WHERE finance_group_id = ? AND id = ?`,
    [name, type, groupId, id]
  );
}

async function deleteCategory(groupId, id) {
  await pool.query(
    `DELETE FROM finance_categories WHERE finance_group_id = ? AND id = ?`,
    [groupId, id]
  );
}

async function ensureDefaultCategories(groupId) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS total FROM finance_categories WHERE finance_group_id = ?',
    [groupId]
  );
  if (rows[0] && rows[0].total > 0) return;

  const expenseDefaults = [
    'Casa',
    'Supermercado',
    'Transporte',
    'Restauracao',
    'Saude',
    'Lazer',
    'Educacao',
    'Assinaturas',
    'Outros',
  ];
  const incomeDefaults = [
    'Salario',
    'Freelance',
    'Rendas',
    'Investimentos',
    'Outros',
  ];

  const values = [];
  const params = [];
  expenseDefaults.forEach((name) => {
    values.push('(?, ?, ?)');
    params.push(groupId, name, 'expense');
  });
  incomeDefaults.forEach((name) => {
    values.push('(?, ?, ?)');
    params.push(groupId, name, 'income');
  });

  if (values.length) {
    await pool.query(
      `INSERT INTO finance_categories (finance_group_id, nome, tipo) VALUES ${values.join(', ')}`,
      params
    );
  }
}

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  ensureDefaultCategories,
};

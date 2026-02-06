const pool = require('../config/db');

async function createGroupForUser(userId, userName) {
  const name = userName ? `Financas de ${userName}` : 'Minhas finanças';
  const [result] = await pool.query(
    'INSERT INTO finance_groups (nome) VALUES (?)',
    [name]
  );
  const groupId = result.insertId;
  await pool.query(
    'UPDATE simulador_utilizadores SET finance_group_id = ? WHERE id = ?',
    [groupId, userId]
  );
  return groupId;
}

async function ensureGroupForUser(user) {
  if (user.finance_group_id) return user.finance_group_id;
  return createGroupForUser(user.id, user.nome);
}

async function linkUserToGroupByEmail({ ownerUserId, ownerGroupId, email }) {
  const [rows] = await pool.query(
    'SELECT id, nome, email, finance_group_id FROM simulador_utilizadores WHERE email = ?',
    [email]
  );
  const target = rows[0];
  if (!target) return { ok: false, reason: 'missing' };
  if (Number(target.id) === Number(ownerUserId)) {
    return { ok: false, reason: 'self' };
  }

  const oldGroupId = target.finance_group_id ? Number(target.finance_group_id) : null;
  if (!oldGroupId || oldGroupId !== Number(ownerGroupId)) {
    await pool.query(
      'UPDATE simulador_utilizadores SET finance_group_id = ? WHERE id = ?',
      [ownerGroupId, target.id]
    );

    if (oldGroupId) {
      // Move existing data to shared group
      await pool.query(
        'UPDATE finance_categories SET finance_group_id = ? WHERE finance_group_id = ?',
        [ownerGroupId, oldGroupId]
      );
      await pool.query(
        'UPDATE finance_budgets SET finance_group_id = ? WHERE finance_group_id = ?',
        [ownerGroupId, oldGroupId]
      );
      await pool.query(
        'UPDATE finance_transactions SET finance_group_id = ? WHERE finance_group_id = ?',
        [ownerGroupId, oldGroupId]
      );
      await pool.query(
        'UPDATE finance_documents SET finance_group_id = ? WHERE finance_group_id = ?',
        [ownerGroupId, oldGroupId]
      );
    }
  }

  return { ok: true, user: target };
}

module.exports = {
  ensureGroupForUser,
  linkUserToGroupByEmail,
};

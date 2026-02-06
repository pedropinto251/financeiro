const pool = require('../config/db');

async function createShare({ ownerGroupId, projectId, listId, sharedWithUserId, permission }) {
  await pool.query(
    `INSERT INTO finance_wishlist_shares (owner_group_id, project_id, list_id, shared_with_user_id, permission)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE permission = VALUES(permission)`,
    [ownerGroupId, projectId, listId || null, sharedWithUserId, permission]
  );
}

async function listSharedItemsForUser(userId) {
  const [projectRows] = await pool.query(
    `SELECT i.id, i.nome, i.descricao, i.imagem_path, i.link_url, i.preco, i.data_alvo, i.estado, i.data_compra,
        p.id AS project_id, p.nome AS project_nome,
        l.id AS list_id, l.nome AS list_nome,
        s.permission, s.owner_group_id
     FROM finance_wishlist_items_v2 i
     INNER JOIN finance_wishlist_shares s ON s.project_id = i.project_id AND s.list_id IS NULL
     INNER JOIN finance_wishlist_projects p ON p.id = i.project_id
     INNER JOIN finance_wishlist_lists l ON l.id = i.list_id
     WHERE s.shared_with_user_id = ?`,
    [userId]
  );

  const [listRows] = await pool.query(
    `SELECT i.id, i.nome, i.descricao, i.imagem_path, i.link_url, i.preco, i.data_alvo, i.estado, i.data_compra,
        p.id AS project_id, p.nome AS project_nome,
        l.id AS list_id, l.nome AS list_nome,
        s.permission, s.owner_group_id
     FROM finance_wishlist_items_v2 i
     INNER JOIN finance_wishlist_shares s ON s.list_id = i.list_id
     INNER JOIN finance_wishlist_projects p ON p.id = i.project_id
     INNER JOIN finance_wishlist_lists l ON l.id = i.list_id
     WHERE s.shared_with_user_id = ?`,
    [userId]
  );

  const byId = new Map();
  const all = [...projectRows, ...listRows];
  for (const row of all) {
    if (!byId.has(row.id)) {
      byId.set(row.id, row);
      continue;
    }
    const existing = byId.get(row.id);
    // Prefer strongest permission if duplicate
    const order = ['view', 'edit', 'mark', 'delete', 'all'];
    const best = order.indexOf(row.permission) > order.indexOf(existing.permission) ? row.permission : existing.permission;
    byId.set(row.id, { ...existing, permission: best });
  }

  return Array.from(byId.values());
}

module.exports = {
  createShare,
  listSharedItemsForUser,
};

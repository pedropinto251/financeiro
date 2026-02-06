const pool = require('../config/db');

async function listProjects(groupId) {
  const [rows] = await pool.query(
    `SELECT id, nome, nota, data_criado
     FROM finance_wishlist_projects
     WHERE finance_group_id = ?
     ORDER BY data_criado DESC`,
    [groupId]
  );
  return rows;
}

async function createProject({ groupId, name, note }) {
  const [result] = await pool.query(
    `INSERT INTO finance_wishlist_projects (finance_group_id, nome, nota)
     VALUES (?, ?, ?)`,
    [groupId, name, note || null]
  );
  return result.insertId;
}

async function listLists(groupId, projectId) {
  const [rows] = await pool.query(
    `SELECT id, nome
     FROM finance_wishlist_lists
     WHERE finance_group_id = ? AND project_id = ?
     ORDER BY nome`,
    [groupId, projectId]
  );
  return rows;
}

async function createList({ groupId, projectId, name }) {
  const [result] = await pool.query(
    `INSERT INTO finance_wishlist_lists (finance_group_id, project_id, nome)
     VALUES (?, ?, ?)`,
    [groupId, projectId, name]
  );
  return result.insertId;
}

async function listWishlistItems(groupId) {
  const [rows] = await pool.query(
    `SELECT i.id, i.nome, i.descricao, i.imagem_path, i.link_url, i.preco, i.data_alvo, i.estado, i.data_compra, i.transaction_id,
        p.id AS project_id, p.nome AS project_nome,
        l.id AS list_id, l.nome AS list_nome
     FROM finance_wishlist_items_v2 i
     INNER JOIN finance_wishlist_projects p ON p.id = i.project_id
     INNER JOIN finance_wishlist_lists l ON l.id = i.list_id
     WHERE i.finance_group_id = ?
     ORDER BY p.nome, l.nome, i.estado, i.data_alvo`,
    [groupId]
  );
  return rows;
}

async function createWishlistItem({ groupId, projectId, listId, name, description, imagePath, linkUrl, price, targetDate, status, purchasedDate, transactionId }) {
  const [result] = await pool.query(
    `INSERT INTO finance_wishlist_items_v2
     (finance_group_id, project_id, list_id, nome, descricao, imagem_path, link_url, preco, data_alvo, estado, data_compra, transaction_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      groupId,
      projectId,
      listId,
      name,
      description || null,
      imagePath || null,
      linkUrl || null,
      price !== null && price !== undefined ? Number(price) : null,
      targetDate || null,
      status || 'planned',
      purchasedDate || null,
      transactionId || null,
    ]
  );
  return result.insertId;
}

async function markWishlistPurchased({ groupId, itemId, purchasedDate, price, transactionId }) {
  await pool.query(
    `UPDATE finance_wishlist_items_v2
     SET estado = 'purchased', data_compra = ?, preco = COALESCE(?, preco), transaction_id = ?
     WHERE id = ? AND finance_group_id = ?`,
    [purchasedDate, price !== null && price !== undefined ? Number(price) : null, transactionId || null, itemId, groupId]
  );
}

async function revertWishlistItem(groupId, itemId) {
  await pool.query(
    `UPDATE finance_wishlist_items_v2
     SET estado = 'planned', data_compra = NULL, transaction_id = NULL
     WHERE id = ? AND finance_group_id = ?`,
    [itemId, groupId]
  );
}

async function updateWishlistItem({ groupId, itemId, name, description, price, targetDate, linkUrl, listId }) {
  await pool.query(
    `UPDATE finance_wishlist_items_v2
     SET nome = ?, descricao = ?, preco = ?, data_alvo = ?, link_url = ?, list_id = ?
     WHERE id = ? AND finance_group_id = ?`,
    [
      name,
      description || null,
      price !== null && price !== undefined ? Number(price) : null,
      targetDate || null,
      linkUrl || null,
      listId,
      itemId,
      groupId,
    ]
  );
}

async function deleteWishlistItem(groupId, itemId) {
  await pool.query(
    `DELETE FROM finance_wishlist_items_v2 WHERE finance_group_id = ? AND id = ?`,
    [groupId, itemId]
  );
}

async function getWishlistImageById(groupId, itemId) {
  const [rows] = await pool.query(
    `SELECT imagem_path
     FROM finance_wishlist_items_v2
     WHERE id = ? AND finance_group_id = ?`,
    [itemId, groupId]
  );
  return rows[0] || null;
}

async function getWishlistItemById(groupId, itemId) {
  const [rows] = await pool.query(
    `SELECT id, transaction_id
     FROM finance_wishlist_items_v2
     WHERE id = ? AND finance_group_id = ?`,
    [itemId, groupId]
  );
  return rows[0] || null;
}

module.exports = {
  listProjects,
  createProject,
  listLists,
  createList,
  listWishlistItems,
  createWishlistItem,
  markWishlistPurchased,
  revertWishlistItem,
  updateWishlistItem,
  deleteWishlistItem,
  getWishlistImageById,
  getWishlistItemById,
};

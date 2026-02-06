const pool = require('../config/db');

async function createDocument({ groupId, transactionId, userId, originalName, filePath, mimeType, fileSize }) {
  const [result] = await pool.query(
    `INSERT INTO finance_documents
     (finance_group_id, transaction_id, user_id, original_name, file_path, mime_type, file_size)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [groupId, transactionId, userId, originalName, filePath, mimeType || null, fileSize || null]
  );
  return result.insertId;
}

async function getDocumentById(id) {
  const [rows] = await pool.query(
    `SELECT id, finance_group_id, transaction_id, user_id, original_name, file_path, mime_type, file_size
     FROM finance_documents
     WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function listDocumentsByTransaction(groupId, transactionId) {
  const [rows] = await pool.query(
    `SELECT id, file_path
     FROM finance_documents
     WHERE finance_group_id = ? AND transaction_id = ?`,
    [groupId, transactionId]
  );
  return rows;
}

async function deleteDocumentsByTransaction(groupId, transactionId) {
  await pool.query(
    `DELETE FROM finance_documents WHERE finance_group_id = ? AND transaction_id = ?`,
    [groupId, transactionId]
  );
}

module.exports = {
  createDocument,
  getDocumentById,
  listDocumentsByTransaction,
  deleteDocumentsByTransaction,
};

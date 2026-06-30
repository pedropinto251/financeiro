const pool = require('../config/db');

// Web Push: subscrições por utilizador + config app (VAPID, token de cron).
// Tabelas garantidas em runtime (sem migração).
let ensured = false;
async function ensureTables() {
  if (ensured) return;
  await pool.query(
    `CREATE TABLE IF NOT EXISTS finance_app_config (
       nome VARCHAR(64) NOT NULL PRIMARY KEY,
       valor TEXT NULL,
       atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS finance_push_subscriptions (
       id INT AUTO_INCREMENT PRIMARY KEY,
       finance_group_id INT NOT NULL,
       user_id INT NOT NULL,
       endpoint VARCHAR(512) NOT NULL,
       p256dh VARCHAR(255) NOT NULL,
       auth VARCHAR(255) NOT NULL,
       data_criado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       UNIQUE KEY uq_push_endpoint (endpoint)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  ensured = true;
}

async function getConfig(name) {
  await ensureTables();
  const [rows] = await pool.query('SELECT valor FROM finance_app_config WHERE nome = ?', [name]);
  return rows[0] ? rows[0].valor : null;
}
async function setConfig(name, value) {
  await ensureTables();
  await pool.query(
    'INSERT INTO finance_app_config (nome, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)',
    [name, value]
  );
}

async function saveSubscription({ groupId, userId, endpoint, p256dh, auth }) {
  await ensureTables();
  await pool.query(
    `INSERT INTO finance_push_subscriptions (finance_group_id, user_id, endpoint, p256dh, auth)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE finance_group_id = VALUES(finance_group_id), user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth)`,
    [groupId, userId, endpoint, p256dh, auth]
  );
}
async function deleteByEndpoint(endpoint) {
  try { await pool.query('DELETE FROM finance_push_subscriptions WHERE endpoint = ?', [endpoint]); } catch (e) { /* */ }
}
async function listByUser(userId) {
  await ensureTables();
  const [rows] = await pool.query('SELECT id, endpoint, p256dh, auth FROM finance_push_subscriptions WHERE user_id = ?', [userId]);
  return rows;
}
async function listAll() {
  await ensureTables();
  const [rows] = await pool.query('SELECT id, finance_group_id, user_id, endpoint, p256dh, auth FROM finance_push_subscriptions');
  return rows;
}

module.exports = { ensureTables, getConfig, setConfig, saveSubscription, deleteByEndpoint, listByUser, listAll };

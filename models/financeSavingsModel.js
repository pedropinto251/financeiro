const pool = require('../config/db');

// Meta de poupança mensal por grupo. Uma linha por grupo.
// A tabela é garantida em runtime (sem migração manual). Se o utilizador da DB
// não tiver CREATE, as funções degradam para 0 em vez de rebentar.
let ensured = false;
async function ensureTable() {
  if (ensured) return;
  await pool.query(
    `CREATE TABLE IF NOT EXISTS finance_monthly_savings (
       finance_group_id INT NOT NULL PRIMARY KEY,
       valor_meta DECIMAL(12,2) NOT NULL DEFAULT 0,
       atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       CONSTRAINT fk_savings_group FOREIGN KEY (finance_group_id)
         REFERENCES finance_groups(id) ON DELETE CASCADE
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  ensured = true;
}

async function getMonthlySavingsTarget(groupId) {
  try {
    await ensureTable();
    const [rows] = await pool.query(
      'SELECT valor_meta FROM finance_monthly_savings WHERE finance_group_id = ?',
      [groupId]
    );
    return rows[0] ? Number(rows[0].valor_meta) : 0;
  } catch (err) {
    return 0; // tabela indisponível → trata como sem meta
  }
}

async function setMonthlySavingsTarget(groupId, value) {
  await ensureTable();
  const amount = Math.max(0, Number(value) || 0);
  await pool.query(
    `INSERT INTO finance_monthly_savings (finance_group_id, valor_meta)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE valor_meta = VALUES(valor_meta)`,
    [groupId, amount]
  );
  return amount;
}

module.exports = { getMonthlySavingsTarget, setMonthlySavingsTarget };

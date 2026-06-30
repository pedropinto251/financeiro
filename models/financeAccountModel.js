const pool = require('../config/db');

// Contas / carteiras (ex.: Conta principal, Cartão alimentação). Cada movimento
// pertence a uma conta (coluna account_id em finance_transactions). O saldo de
// cada conta = receitas − despesas dessa conta.
// Esquema garantido em runtime (sem migração manual). Se faltar privilégio de
// ALTER, a feature degrada (txColumn=false) mas a app continua a funcionar.
let schemaReady = false;
let hasTxColumn = false;

async function ensureSchema() {
  if (schemaReady) return;
  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS finance_accounts (
         id INT AUTO_INCREMENT PRIMARY KEY,
         finance_group_id INT NOT NULL,
         nome VARCHAR(80) NOT NULL,
         cor VARCHAR(16) NULL,
         icone VARCHAR(32) NULL,
         is_default TINYINT NOT NULL DEFAULT 0,
         ativo TINYINT NOT NULL DEFAULT 1,
         include_in_total TINYINT NOT NULL DEFAULT 1,
         ordem INT NOT NULL DEFAULT 0,
         data_criado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT fk_account_group FOREIGN KEY (finance_group_id)
           REFERENCES finance_groups(id) ON DELETE CASCADE
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    // Tabela pode já existir sem include_in_total (criada antes desta feature).
    const [acol] = await pool.query(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'finance_accounts' AND COLUMN_NAME = 'include_in_total'`
    );
    if (!acol[0] || Number(acol[0].n) === 0) {
      await pool.query('ALTER TABLE finance_accounts ADD COLUMN include_in_total TINYINT NOT NULL DEFAULT 1');
    }
    // Coluna account_id em finance_transactions (MySQL não tem ADD COLUMN IF NOT EXISTS).
    const [cols] = await pool.query(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'finance_transactions' AND COLUMN_NAME = 'account_id'`
    );
    if (!cols[0] || Number(cols[0].n) === 0) {
      await pool.query('ALTER TABLE finance_transactions ADD COLUMN account_id INT NULL');
      await pool.query('ALTER TABLE finance_transactions ADD INDEX idx_tx_account (account_id)').catch(() => {});
    }
    hasTxColumn = true;
  } catch (err) {
    console.error('[accounts] ensureSchema falhou:', err.message);
  }
  schemaReady = true;
}

function accountsHaveColumn() { return hasTxColumn; }

// Garante a conta por defeito do grupo e migra movimentos sem conta para ela.
async function ensureGroupAccounts(groupId) {
  await ensureSchema();
  if (!hasTxColumn) return null;
  const [rows] = await pool.query(
    'SELECT id FROM finance_accounts WHERE finance_group_id = ? ORDER BY is_default DESC, id ASC LIMIT 1',
    [groupId]
  );
  if (rows[0]) return rows[0].id;
  const [res] = await pool.query(
    `INSERT INTO finance_accounts (finance_group_id, nome, cor, icone, is_default, ativo)
     VALUES (?, 'Conta principal', '#10b981', 'wallet', 1, 1)`,
    [groupId]
  );
  const defaultId = res.insertId;
  await pool.query(
    'UPDATE finance_transactions SET account_id = ? WHERE finance_group_id = ? AND account_id IS NULL',
    [defaultId, groupId]
  ).catch(() => {});
  return defaultId;
}

async function getDefaultAccountId(groupId) {
  return ensureGroupAccounts(groupId);
}

async function listAccounts(groupId) {
  await ensureSchema();
  if (!hasTxColumn) return [];
  await ensureGroupAccounts(groupId);
  const [rows] = await pool.query(
    `SELECT a.id, a.nome, a.cor, a.icone, a.is_default, a.ativo, a.include_in_total,
        COALESCE(SUM(CASE WHEN t.tipo = 'income' THEN t.valor
                          WHEN t.tipo = 'expense' THEN -t.valor ELSE 0 END), 0) AS saldo
     FROM finance_accounts a
     LEFT JOIN finance_transactions t
       ON t.account_id = a.id AND t.status = 'active'
     WHERE a.finance_group_id = ?
     GROUP BY a.id, a.nome, a.cor, a.icone, a.is_default, a.ativo, a.include_in_total
     ORDER BY a.is_default DESC, a.ordem ASC, a.nome ASC`,
    [groupId]
  );
  return rows;
}

async function createAccount({ groupId, nome, cor, icone, includeInTotal }) {
  await ensureGroupAccounts(groupId);
  // Cartões de alimentação/refeição não contam para o saldo total por defeito.
  const auto = /aliment|refei|ticket|meal|edenred|swile/i.test(nome || '') ? 0 : 1;
  const inc = includeInTotal === false ? 0 : includeInTotal === true ? 1 : auto;
  const [res] = await pool.query(
    `INSERT INTO finance_accounts (finance_group_id, nome, cor, icone, is_default, ativo, include_in_total)
     VALUES (?, ?, ?, ?, 0, 1, ?)`,
    [groupId, nome, cor || '#5b8cff', icone || 'wallet', inc]
  );
  return res.insertId;
}

async function updateAccount({ groupId, id, nome, cor, icone, ativo, includeInTotal }) {
  await pool.query(
    `UPDATE finance_accounts SET nome = ?, cor = ?, icone = ?, ativo = ?, include_in_total = ?
     WHERE finance_group_id = ? AND id = ?`,
    [nome, cor || '#5b8cff', icone || 'wallet', ativo ? 1 : 0, includeInTotal === false ? 0 : 1, groupId, id]
  );
}

async function deleteAccount(groupId, id) {
  // Não apaga a conta por defeito; move os movimentos da conta apagada para a default.
  const [acc] = await pool.query('SELECT is_default FROM finance_accounts WHERE finance_group_id = ? AND id = ?', [groupId, id]);
  if (!acc[0]) return;
  if (acc[0].is_default) return; // protegida
  const defaultId = await getDefaultAccountId(groupId);
  await pool.query('UPDATE finance_transactions SET account_id = ? WHERE finance_group_id = ? AND account_id = ?', [defaultId, groupId, id]);
  await pool.query('DELETE FROM finance_accounts WHERE finance_group_id = ? AND id = ?', [groupId, id]);
}

module.exports = {
  ensureSchema,
  ensureGroupAccounts,
  getDefaultAccountId,
  accountsHaveColumn,
  listAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
};

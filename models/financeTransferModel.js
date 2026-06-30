const pool = require('../config/db');

// Transferências entre contas. NÃO são receita/despesa — só movem saldo entre
// contas. Por isso ficam numa tabela própria (os resumos de receita/despesa
// ignoram-nas; o saldo de cada conta é ajustado em financeAccountModel).
let ensured = false;
async function ensureTable() {
  if (ensured) return;
  await pool.query(
    `CREATE TABLE IF NOT EXISTS finance_transfers (
       id INT AUTO_INCREMENT PRIMARY KEY,
       finance_group_id INT NOT NULL,
       from_account_id INT NOT NULL,
       to_account_id INT NOT NULL,
       valor DECIMAL(12,2) NOT NULL,
       data_transferencia DATE NOT NULL,
       descricao VARCHAR(255) NULL,
       data_criado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       CONSTRAINT fk_transfer_group FOREIGN KEY (finance_group_id)
         REFERENCES finance_groups(id) ON DELETE CASCADE
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  ensured = true;
}

async function createTransfer({ groupId, fromAccountId, toAccountId, amount, date, descricao }) {
  await ensureTable();
  const [res] = await pool.query(
    `INSERT INTO finance_transfers (finance_group_id, from_account_id, to_account_id, valor, data_transferencia, descricao)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [groupId, fromAccountId, toAccountId, amount, date, descricao || null]
  );
  return res.insertId;
}

async function listTransfers(groupId, limit = 50) {
  await ensureTable();
  const [rows] = await pool.query(
    `SELECT t.id, t.from_account_id, t.to_account_id, t.valor, t.data_transferencia, t.descricao,
        af.nome AS from_nome, at.nome AS to_nome
     FROM finance_transfers t
     LEFT JOIN finance_accounts af ON af.id = t.from_account_id
     LEFT JOIN finance_accounts at ON at.id = t.to_account_id
     WHERE t.finance_group_id = ?
     ORDER BY t.data_transferencia DESC, t.id DESC
     LIMIT ?`,
    [groupId, limit]
  );
  return rows;
}

async function deleteTransfer(groupId, id) {
  await pool.query('DELETE FROM finance_transfers WHERE finance_group_id = ? AND id = ?', [groupId, id]);
}

module.exports = { ensureTable, createTransfer, listTransfers, deleteTransfer };

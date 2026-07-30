const pool = require('../config/db');

// Movimentos recorrentes (fixos). Motor geral:
//   - frequencia 'mensal' → ocorre no `dia` do mês
//   - frequencia 'dias'   → ocorre a cada `intervalo` dias (ex.: ginásio 15/15)
// Cada fixa guarda `proxima_data` (próxima ocorrência por lançar). O "lançar"
// gera todas as ocorrências em atraso até hoje e avança a próxima data.
// Tabela garantida em runtime (sem migração); resiliente se faltar CREATE.
let ensured = false;
let hasAccountCol = false;
async function ensureTable() {
  if (ensured) return;
  await pool.query(
    `CREATE TABLE IF NOT EXISTS finance_recurring (
       id INT AUTO_INCREMENT PRIMARY KEY,
       finance_group_id INT NOT NULL,
       tipo VARCHAR(10) NOT NULL DEFAULT 'expense',
       categoria_id INT NULL,
       valor DECIMAL(12,2) NOT NULL DEFAULT 0,
       descricao VARCHAR(255) NULL,
       frequencia VARCHAR(10) NOT NULL DEFAULT 'mensal',
       intervalo INT NOT NULL DEFAULT 1,
       dia INT NOT NULL DEFAULT 1,
       proxima_data DATE NOT NULL,
       ativo TINYINT NOT NULL DEFAULT 1,
       account_id INT NULL,
       data_criado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       CONSTRAINT fk_recurring_group FOREIGN KEY (finance_group_id)
         REFERENCES finance_groups(id) ON DELETE CASCADE
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  // Tabela pode já existir sem a coluna account_id (criada antes desta feature).
  try {
    const [cols] = await pool.query(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'finance_recurring' AND COLUMN_NAME = 'account_id'`
    );
    if (!cols[0] || Number(cols[0].n) === 0) {
      await pool.query('ALTER TABLE finance_recurring ADD COLUMN account_id INT NULL');
    }
    hasAccountCol = true;
  } catch (e) { /* sem privilégio de ALTER → segue sem conta nas fixas */ }
  ensured = true;
}

// ── Date helpers (string YYYY-MM-DD, sem timezone) ──────────────────────
// Sentinelas do `dia` (mesmas do ciclo de salário): valores que significam uma
// regra em vez de um dia fixo, guardados na coluna `dia` sem mexer no schema.
const LAST_BUSINESS = 99;  // último dia útil do mês
const LAST_CALENDAR = 100; // último dia do mês (civil)

function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); } // m 0-based
function pad(n) { return String(n).padStart(2, '0'); }
function iso(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function parse(s) { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return { y, m: m - 1, d }; }

function lastBusinessDayOfMonth(y, m) {
  let d = daysInMonth(y, m);
  const dow = new Date(y, m, d).getDay();
  if (dow === 6) d -= 1;        // Sáb → Sex
  else if (dow === 0) d -= 2;   // Dom → Sex
  return d;
}

// Resolve o dia concreto do mês (y, m) a partir de `dia`, tratando as sentinelas.
function resolveDay(y, m, dia) {
  const n = Number(dia);
  if (n === LAST_CALENDAR) return daysInMonth(y, m);
  if (n === LAST_BUSINESS) return lastBusinessDayOfMonth(y, m);
  return Math.min(Math.max(1, Math.floor(n) || 1), daysInMonth(y, m));
}

// Normaliza um `dia` vindo do cliente: preserva sentinelas, senão 1..31.
function normalizeDia(v) {
  const n = Number(v);
  if (n === LAST_BUSINESS || n === LAST_CALENDAR) return n;
  return Math.min(31, Math.max(1, Math.floor(n) || 1));
}

function addDays(isoStr, n) {
  const { y, m, d } = parse(isoStr);
  const dt = new Date(y, m, d + n);
  return iso(dt.getFullYear(), dt.getMonth(), dt.getDate());
}
function addMonthOnDay(isoStr, dia) {
  const { y, m } = parse(isoStr);
  const nm = m + 1; const ny = y + Math.floor(nm / 12); const nmo = nm % 12;
  return iso(ny, nmo, resolveDay(ny, nmo, dia));
}

// Próxima ocorrência a partir da atual.
function nextOccurrence(currentIso, frequencia, intervalo, dia) {
  if (frequencia === 'dias') return addDays(currentIso, Math.max(1, Number(intervalo) || 1));
  return addMonthOnDay(currentIso, dia);
}

// Primeira ocorrência ao criar/editar (a partir de `startIso`, tipicamente hoje).
function firstOccurrence(frequencia, intervalo, dia, startIso) {
  if (frequencia === 'dias') return String(startIso).slice(0, 10);
  const { y, m, d } = parse(startIso);
  const day = resolveDay(y, m, dia);
  if (d <= day) return iso(y, m, day);
  return addMonthOnDay(iso(y, m, d), dia);
}

// ── CRUD ────────────────────────────────────────────────────────────────
async function listRecurring(groupId) {
  await ensureTable();
  const accSel = hasAccountCol ? ', r.account_id, ac.nome AS account_nome, ac.cor AS account_cor' : '';
  const accJoin = hasAccountCol ? 'LEFT JOIN finance_accounts ac ON ac.id = r.account_id' : '';
  const [rows] = await pool.query(
    `SELECT r.id, r.tipo, r.categoria_id, r.valor, r.descricao, r.frequencia,
        r.intervalo, r.dia, r.proxima_data, r.ativo,
        c.nome AS categoria_nome${accSel}
     FROM finance_recurring r
     LEFT JOIN finance_categories c ON c.id = r.categoria_id
     ${accJoin}
     WHERE r.finance_group_id = ?
     ORDER BY r.ativo DESC, r.proxima_data ASC`,
    [groupId]
  );
  return rows;
}

async function getRecurringById(groupId, id) {
  await ensureTable();
  const [rows] = await pool.query(
    'SELECT * FROM finance_recurring WHERE finance_group_id = ? AND id = ?',
    [groupId, id]
  );
  return rows[0] || null;
}

async function createRecurring(r) {
  await ensureTable();
  if (hasAccountCol) {
    const [res] = await pool.query(
      `INSERT INTO finance_recurring
         (finance_group_id, tipo, categoria_id, valor, descricao, frequencia, intervalo, dia, proxima_data, ativo, account_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.groupId, r.tipo, r.categoryId || null, r.amount, r.descricao || null,
       r.frequencia, r.intervalo, r.dia, r.proximaData, r.ativo ? 1 : 0, r.accountId || null]
    );
    return res.insertId;
  }
  const [res] = await pool.query(
    `INSERT INTO finance_recurring
       (finance_group_id, tipo, categoria_id, valor, descricao, frequencia, intervalo, dia, proxima_data, ativo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [r.groupId, r.tipo, r.categoryId || null, r.amount, r.descricao || null,
     r.frequencia, r.intervalo, r.dia, r.proximaData, r.ativo ? 1 : 0]
  );
  return res.insertId;
}

async function updateRecurring(r) {
  await ensureTable();
  if (hasAccountCol) {
    await pool.query(
      `UPDATE finance_recurring
       SET tipo = ?, categoria_id = ?, valor = ?, descricao = ?, frequencia = ?,
           intervalo = ?, dia = ?, proxima_data = ?, ativo = ?, account_id = ?
       WHERE finance_group_id = ? AND id = ?`,
      [r.tipo, r.categoryId || null, r.amount, r.descricao || null, r.frequencia,
       r.intervalo, r.dia, r.proximaData, r.ativo ? 1 : 0, r.accountId || null, r.groupId, r.id]
    );
    return;
  }
  await pool.query(
    `UPDATE finance_recurring
     SET tipo = ?, categoria_id = ?, valor = ?, descricao = ?, frequencia = ?,
         intervalo = ?, dia = ?, proxima_data = ?, ativo = ?
     WHERE finance_group_id = ? AND id = ?`,
    [r.tipo, r.categoryId || null, r.amount, r.descricao || null, r.frequencia,
     r.intervalo, r.dia, r.proximaData, r.ativo ? 1 : 0, r.groupId, r.id]
  );
}

async function setProximaData(groupId, id, isoDate) {
  await pool.query(
    'UPDATE finance_recurring SET proxima_data = ? WHERE finance_group_id = ? AND id = ?',
    [isoDate, groupId, id]
  );
}

async function deleteRecurring(groupId, id) {
  await ensureTable();
  await pool.query('DELETE FROM finance_recurring WHERE finance_group_id = ? AND id = ?', [groupId, id]);
}

async function countDue(groupId, todayIso) {
  try {
    await ensureTable();
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS total FROM finance_recurring WHERE finance_group_id = ? AND ativo = 1 AND proxima_data <= ?',
      [groupId, todayIso]
    );
    return rows[0] ? Number(rows[0].total || 0) : 0;
  } catch (e) { return 0; }
}

module.exports = {
  listRecurring,
  getRecurringById,
  createRecurring,
  updateRecurring,
  setProximaData,
  deleteRecurring,
  countDue,
  nextOccurrence,
  firstOccurrence,
  normalizeDia,
  LAST_BUSINESS,
  LAST_CALENDAR,
};

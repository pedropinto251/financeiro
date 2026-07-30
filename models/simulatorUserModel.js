const bcrypt = require('bcrypt');
const pool = require('../config/db');

async function getSimUserByEmail(email) {
	const [rows] = await pool.query(
		`SELECT id, nome, email, password_hash, role, ativo, finance_group_id, ciclo_dia, ciclo_proximo_util, ciclo_inicio_manual
		 FROM simulador_utilizadores
		 WHERE email = ?`,
		[email]
	);
	return rows[0] || null;
}

async function getSimUserById(id) {
	const [rows] = await pool.query(
		`SELECT id, nome, email, role, ativo, finance_group_id, ciclo_dia, ciclo_proximo_util, ciclo_inicio_manual
		 FROM simulador_utilizadores
		 WHERE id = ?`,
		[id]
	);
	return rows[0] || null;
}

async function validateSimPassword(user, password) {
	if (!user || !user.password_hash) return false;
	return bcrypt.compare(password, user.password_hash);
}

async function listSimUsers() {
	const [rows] = await pool.query(
		`SELECT id, nome, email, role, ativo, finance_group_id, ciclo_dia, ciclo_proximo_util, ciclo_inicio_manual, data_criado
		 FROM simulador_utilizadores
		 ORDER BY data_criado DESC`
	);
	return rows;
}

async function createSimUser({ name, email, password, role, cycleDay, cycleNextBusinessDay }) {
	const hash = await bcrypt.hash(password, 10);
	const [result] = await pool.query(
		`INSERT INTO simulador_utilizadores (nome, email, password_hash, role, ativo, ciclo_dia, ciclo_proximo_util)
		 VALUES (?, ?, ?, ?, 1, ?, ?)`,
		[
			name,
			email,
			hash,
			role === 'admin' ? 'admin' : 'user',
			cycleDay,
			cycleNextBusinessDay ? 1 : 0,
		]
	);
	return result.insertId;
}

async function updateSimUser({ id, name, email, role, active, cycleDay, cycleNextBusinessDay }) {
	await pool.query(
		`UPDATE simulador_utilizadores
		 SET nome = ?, email = ?, role = ?, ativo = ?, ciclo_dia = ?, ciclo_proximo_util = ?
		 WHERE id = ?`,
		[
			name,
			email,
			role === 'admin' ? 'admin' : 'user',
			active ? 1 : 0,
			cycleDay,
			cycleNextBusinessDay ? 1 : 0,
			id,
		]
	);
}

async function updateUserCycle({ id, cycleDay, cycleNextBusinessDay }) {
	await pool.query(
		`UPDATE simulador_utilizadores SET ciclo_dia = ?, ciclo_proximo_util = ? WHERE id = ?`,
		[cycleDay, cycleNextBusinessDay ? 1 : 0, id]
	);
}

// Início de ciclo manual ("já recebi o salário"): guarda uma data (YYYY-MM-DD)
// ou null para limpar. Garante a coluna à primeira utilização (sem migração).
let cycleOverrideColReady = false;
async function ensureCycleOverrideColumn() {
	if (cycleOverrideColReady) return;
	try {
		const [cols] = await pool.query(
			`SELECT COUNT(*) AS n FROM information_schema.COLUMNS
			 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'simulador_utilizadores' AND COLUMN_NAME = 'ciclo_inicio_manual'`
		);
		if (!cols[0] || Number(cols[0].n) === 0) {
			await pool.query('ALTER TABLE simulador_utilizadores ADD COLUMN ciclo_inicio_manual DATE NULL');
		}
		cycleOverrideColReady = true;
	} catch (e) { /* sem privilégio de ALTER → segue sem override */ }
}

async function updateCycleOverride({ id, date }) {
	await ensureCycleOverrideColumn();
	await pool.query(
		`UPDATE simulador_utilizadores SET ciclo_inicio_manual = ? WHERE id = ?`,
		[date || null, id]
	);
}

async function getSimUserByEmailExceptId(email, id) {
	const [rows] = await pool.query(
		`SELECT id FROM simulador_utilizadores WHERE email = ? AND id <> ?`,
		[email, id]
	);
	return rows[0] || null;
}

module.exports = {
	getSimUserByEmail,
	getSimUserById,
	validateSimPassword,
	listSimUsers,
	createSimUser,
	updateSimUser,
	updateUserCycle,
	updateCycleOverride,
	getSimUserByEmailExceptId,
};

const bcrypt = require('bcrypt');
const pool = require('../config/db');

async function getSimUserByEmail(email) {
	const [rows] = await pool.query(
		`SELECT id, nome, email, password_hash, role, ativo, finance_group_id
		 FROM simulador_utilizadores
		 WHERE email = ?`,
		[email]
	);
	return rows[0] || null;
}

async function getSimUserById(id) {
	const [rows] = await pool.query(
		`SELECT id, nome, email, role, ativo, finance_group_id
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
		`SELECT id, nome, email, role, ativo, finance_group_id, data_criado
		 FROM simulador_utilizadores
		 ORDER BY data_criado DESC`
	);
	return rows;
}

async function createSimUser({ name, email, password, role }) {
	const hash = await bcrypt.hash(password, 10);
	const [result] = await pool.query(
		`INSERT INTO simulador_utilizadores (nome, email, password_hash, role, ativo)
		 VALUES (?, ?, ?, ?, 1)`,
		[name, email, hash, role === 'admin' ? 'admin' : 'user']
	);
	return result.insertId;
}

async function updateSimUser({ id, name, email, role, active }) {
	await pool.query(
		`UPDATE simulador_utilizadores
		 SET nome = ?, email = ?, role = ?, ativo = ?
		 WHERE id = ?`,
		[name, email, role === 'admin' ? 'admin' : 'user', active ? 1 : 0, id]
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
	getSimUserByEmailExceptId,
};

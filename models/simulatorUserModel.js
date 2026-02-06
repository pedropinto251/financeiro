const bcrypt = require('bcrypt');
const pool = require('../config/db');

async function getSimUserByEmail(email) {
	const [rows] = await pool.query(
		`SELECT id, nome, email, password_hash, role, ativo
		 FROM simulador_utilizadores
		 WHERE email = ?`,
		[email]
	);
	return rows[0] || null;
}

async function validateSimPassword(user, password) {
	if (!user || !user.password_hash) return false;
	return bcrypt.compare(password, user.password_hash);
}

module.exports = {
	getSimUserByEmail,
	validateSimPassword,
};

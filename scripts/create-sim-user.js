const bcrypt = require('bcrypt');
const pool = require('../config/db');

async function main() {
	const nome = process.argv[2];
	const email = process.argv[3];
	const password = process.argv[4];
	const role = process.argv[5] || 'admin';

	if (!nome || !email || !password) {
		console.log('Uso: node scripts/create-sim-user.js <nome> <email> <password> [role]');
		process.exit(1);
	}

	const hash = await bcrypt.hash(password, 10);
	await pool.query(
		`INSERT INTO simulador_utilizadores (nome, email, password_hash, role)
		 VALUES (?, ?, ?, ?)
		 ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = VALUES(role)`,
		[nome, email, hash, role]
	);
	console.log('Utilizador criado/atualizado.');
	process.exit(0);
}

main().catch((err) => {
	console.error('Erro:', err.message || err);
	process.exit(1);
});

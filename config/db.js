const mysql = require('mysql2/promise');

// Pool de ligações MySQL para reuse eficiente
const pool = mysql.createPool({
	host: process.env.DB_HOST || 'localhost',
	user: process.env.DB_USER || 'root',
	password: process.env.DB_PASSWORD || '',
	database: process.env.DB_NAME || 'loja',
	port: Number(process.env.DB_PORT) || 3306,
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0,

	enableKeepAlive: true,
	keepAliveInitialDelay: 10000,

	connectTimeout: 10000
});

module.exports = pool;

require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');
const authRoutes = require('./routes/authRoutes');
const homeRoutes = require('./routes/homeRoutes');
const apiRoutes = require('./routes/apiRoutes');

const app = express();

// cPanel / reverse proxy
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Headers de segurança básicos.
app.use((req, res, next) => {
	res.setHeader('X-Content-Type-Options', 'nosniff');
	res.setHeader('X-Frame-Options', 'SAMEORIGIN');
	res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
	next();
});

// --- Config Express ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Vue SPA build (financeiro.softpinto.pt) lives in public/financeiro and is
// served at the subdomain root — its /assets, /icon.svg, /manifest, etc.
app.use(express.static(path.join(__dirname, 'public', 'financeiro')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- CORS for API (React Native / web dev) ---
app.use('/api', (req, res, next) => {
	const origin = req.headers.origin || '*';
	res.setHeader('Access-Control-Allow-Origin', origin);
	res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	res.setHeader('Access-Control-Allow-Credentials', 'true');
	if (req.method === 'OPTIONS') return res.sendStatus(204);
	return next();
});
// Forçar HTTPS (opcional, depende da env FORCE_HTTPS)
const forceHttps = process.env.FORCE_HTTPS === 'true';
app.use((req, res, next) => {
	if (!forceHttps) return next();

	const proto = (req.headers['x-forwarded-proto'] || '').toString().toLowerCase();
	const forwardedSsl = (req.headers['x-forwarded-ssl'] || '').toString().toLowerCase();
	const arrSsl = req.headers['x-arr-ssl']; // IIS/Azure
	const isHttps =
		req.secure ||
		proto === 'https' ||
		forwardedSsl === 'on' ||
		!!arrSsl;

	// Só redireciona se o proxy indicar explicitamente http; evita loops quando não há header
	if (!isHttps && (proto === 'http' || forwardedSsl === 'off')) {
		return res.redirect('https://' + req.headers.host + req.originalUrl);
	}
	return next();
});

// --- Session store (MySQL só em produção, ou se tiveres DB_* em dev) ---
let sessionStore = null;

const hasDbEnv =
	process.env.DB_HOST &&
	process.env.DB_USER &&
	process.env.DB_NAME;

if (process.env.NODE_ENV === 'production' || hasDbEnv) {
	const MySQLStore = require('express-mysql-session')(session);
	sessionStore = new MySQLStore({
		host: process.env.DB_HOST,
		port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
		user: process.env.DB_USER,
		password: process.env.DB_PASS || process.env.DB_PASSWORD,
		database: process.env.DB_NAME,
	});
}

// ✅ Cookies: secure configurável (default: auto, usa https se o proxy marcar)
const cookieSecure =
	process.env.SESSION_COOKIE_SECURE === 'true'
		? true
		: process.env.SESSION_COOKIE_SECURE === 'false'
			? false
			: 'auto'; // requer app.set('trust proxy', 1)

app.use(
	session({
		...(sessionStore ? { store: sessionStore } : {}), // se não existir, usa MemoryStore (dev)
		secret: process.env.SESSION_SECRET || 'dev-secret',
		resave: false,
		saveUninitialized: false,
		proxy: true, // já está trust proxy=1
		cookie: {
			httpOnly: true,
			sameSite: 'lax',
			secure: cookieSecure, // ✅ dev: false | prod: true
			maxAge: 1000 * 60 * 60 * 24 * 7,
		},
	})
);

// Expõe user às views
app.use((req, res, next) => {
	if (req.session && req.session.simUser) {
		req.user = req.session.simUser;
	}
	res.locals.user = req.user;
	next();
});

// --- Rotas ---
// API first (the SPA + native app talk to /api).
app.use('/api', apiRoutes);

// Serve the Vue SPA index for the routes it owns (and deep links / refresh).
const spaIndex = path.join(__dirname, 'public', 'financeiro', 'index.html');
const sendApp = (req, res, next) => {
	if (require('fs').existsSync(spaIndex)) return res.sendFile(spaIndex);
	return next(); // SPA not built yet → fall back to legacy EJS below
};
const SPA_PATHS = ['/', '/login', '/dashboard', '/movimentos', '/categorias', '/budgets', '/objetivos', '/partilhar'];
SPA_PATHS.forEach((p) => app.get(p, sendApp));

// Legacy EJS routes for features not yet ported to the SPA
// (wishlist, imóveis, admin de utilizadores, exportação de relatórios, downloads).
app.use('/', authRoutes);
app.use('/', homeRoutes);

// SPA fallback: any other non-API GET returns the app shell so client-side
// routes work on refresh / deep link.
app.get(/^\/(?!api\/).*/, sendApp);

// 404
app.use((req, res) => {
	if (req.session && req.session.simUser) {
		return res.redirect('/dashboard');
	}
	return res.redirect('/login');
});

// Erros
app.use((err, req, res, next) => {
	console.error(err);
	if (res.headersSent) return next(err);
	if (req.session && req.session.simUser) {
		return res.redirect('/dashboard');
	}
	return res.redirect('/login');
});
// Garante o esquema de contas/carteiras (tabela + coluna account_id) ao arrancar.
require('./models/financeAccountModel').ensureSchema().catch((e) => console.error('ensureSchema:', e.message));

// --- Start ---
const PORT = process.env.PORT || 3000; // aceita pipe em iisnode
app.listen(PORT, () => {
	console.log(
		`Servidor iniciado na porta ${PORT} (NODE_ENV=${process.env.NODE_ENV || 'dev'})`,
		`http://localhost:${PORT}`
	);
});

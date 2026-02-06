const { getSimUserByEmail, validateSimPassword } = require('../models/simulatorUserModel');
const { ensureGroupForUser } = require('../models/financeGroupModel');

function renderLogin(req, res) {
  res.render('login', {
    title: 'Entrar',
    error: req.query.error || null,
    email: req.query.email || '',
    redirect: req.query.redirect || '',
  });
}

async function handleLogin(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.redirect('/login?error=missing');
    }
    const user = await getSimUserByEmail(email);
    if (!user) {
      return res.redirect(`/login?error=invalid&email=${encodeURIComponent(email)}`);
    }
    if (user.ativo === 0) {
      return res.redirect('/login?error=inactive');
    }
    const ok = await validateSimPassword(user, password);
    if (!ok) {
      return res.redirect(`/login?error=invalid&email=${encodeURIComponent(email)}`);
    }
    const groupId = await ensureGroupForUser(user);
    req.session.simUser = {
      id: user.id,
      email: user.email,
      nome: user.nome,
      role: user.role,
      finance_group_id: groupId,
    };
    const redirect = req.query.redirect ? decodeURIComponent(req.query.redirect) : '/dashboard';
    return res.redirect(redirect);
  } catch (err) {
    return next(err);
  }
}

function logout(req, res) {
  if (!req.session) {
    return res.redirect('/login');
  }
  req.session.destroy(() => res.redirect('/login'));
}

module.exports = {
  renderLogin,
  handleLogin,
  logout,
};

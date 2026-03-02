const { getSimUserById } = require('../models/simulatorUserModel');
const { ensureGroupForUser } = require('../models/financeGroupModel');

async function ensureAuth(req, res, next) {
  if (req.session && req.session.simUser) {
    try {
      const dbUser = await getSimUserById(req.session.simUser.id);
      if (!dbUser || dbUser.ativo === 0) {
        return res.redirect('/login');
      }
      const groupId = await ensureGroupForUser(dbUser);
      req.session.simUser = {
        id: dbUser.id,
        email: dbUser.email,
        nome: dbUser.nome,
        role: dbUser.role,
        finance_group_id: groupId,
        cycle_day: dbUser.ciclo_dia,
        cycle_next_business_day: dbUser.ciclo_proximo_util,
      };
      req.user = req.session.simUser;
      return next();
    } catch (err) {
      return next(err);
    }
  }
  const redirect = encodeURIComponent(req.originalUrl || '/dashboard');
  return res.redirect(`/login?redirect=${redirect}`);
}

function ensureAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  return res.redirect('/dashboard');
}

module.exports = { ensureAuth, ensureAdmin };

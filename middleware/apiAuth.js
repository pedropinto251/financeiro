const jwt = require('jsonwebtoken');
const { getSimUserById } = require('../models/simulatorUserModel');
const { ensureGroupForUser } = require('../models/financeGroupModel');

// Hydrate req.user from a DB user id (shared by both auth paths).
async function hydrate(req, userId) {
  const user = await getSimUserById(userId);
  if (!user || user.ativo === 0) return null;
  const groupId = await ensureGroupForUser(user);
  req.user = {
    ...user,
    finance_group_id: groupId,
    cycle_day: user.ciclo_dia,
    cycle_next_business_day: user.ciclo_proximo_util,
  };
  return req.user;
}

// Accept EITHER a session cookie (web SPA) OR a Bearer JWT (native mobile app).
async function apiAuth(req, res, next) {
  try {
    // 1) Session (web SPA on the subdomain — withCredentials).
    if (req.session && req.session.simUser) {
      const u = await hydrate(req, req.session.simUser.id);
      if (!u) return res.status(401).json({ error: 'invalid_user' });
      return next();
    }
    // 2) Bearer token (React Native / API clients).
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'missing_token' });
    const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'dev-secret';
    const payload = jwt.verify(token, secret);
    const u = await hydrate(req, payload.sub);
    if (!u) return res.status(401).json({ error: 'invalid_user' });
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

module.exports = { apiAuth };

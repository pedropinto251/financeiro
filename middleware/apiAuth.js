const jwt = require('jsonwebtoken');
const { getSimUserById } = require('../models/simulatorUserModel');
const { ensureGroupForUser } = require('../models/financeGroupModel');

async function apiAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing_token' });
  try {
    const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'dev-secret';
    const payload = jwt.verify(token, secret);
    const user = await getSimUserById(payload.sub);
    if (!user || user.ativo === 0) return res.status(401).json({ error: 'invalid_user' });
    const groupId = await ensureGroupForUser(user);
    req.user = {
      ...user,
      finance_group_id: groupId,
      cycle_day: user.ciclo_dia,
      cycle_next_business_day: user.ciclo_proximo_util,
    };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

module.exports = { apiAuth };

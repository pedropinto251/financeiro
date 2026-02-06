function ensureAuth(req, res, next) {
  if (req.session && req.session.simUser) {
    req.user = req.session.simUser;
    return next();
  }
  const redirect = encodeURIComponent(req.originalUrl || '/dashboard');
  return res.redirect(`/login?redirect=${redirect}`);
}

function ensureAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  return res.redirect('/dashboard');
}

module.exports = { ensureAuth, ensureAdmin };

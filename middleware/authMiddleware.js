function ensureAuth(req, res, next) {
  if (req.session && req.session.simUser) {
    req.user = req.session.simUser;
    return next();
  }
  const redirect = encodeURIComponent(req.originalUrl || '/dashboard');
  return res.redirect(`/login?redirect=${redirect}`);
}

module.exports = { ensureAuth };

function renderHome(req, res) {
  res.render('home', {
    title: 'Home',
    user: req.user,
  });
}

module.exports = { renderHome };

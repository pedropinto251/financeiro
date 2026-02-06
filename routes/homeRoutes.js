const express = require('express');
const { ensureAuth } = require('../middleware/authMiddleware');
const { renderHome } = require('../controllers/homeController');

const router = express.Router();

router.get('/', (req, res) => {
  if (req.session && req.session.simUser) {
    return res.redirect('/home');
  }
  return res.redirect('/login');
});

router.get('/home', ensureAuth, renderHome);

module.exports = router;

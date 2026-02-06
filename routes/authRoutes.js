const express = require('express');
const { renderLogin, handleLogin, logout } = require('../controllers/authController');

const router = express.Router();

router.get('/login', renderLogin);
router.post('/login', handleLogin);

router.get('/logout', logout);

module.exports = router;

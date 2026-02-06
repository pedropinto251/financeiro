const express = require('express');
const { ensureAuth } = require('../middleware/authMiddleware');
const {
  renderDashboard,
  renderTransactions,
  renderCategories,
  renderBudgets,
  renderShare,
  handleCreateCategory,
  handleCreateBudget,
  handleCreateTransaction,
  handleShare,
  handleDownloadDocument,
} = require('../controllers/financeController');
const upload = require('../config/upload');

const router = express.Router();

router.get('/', (req, res) => {
  if (req.session && req.session.simUser) {
    return res.redirect('/dashboard');
  }
  return res.redirect('/login');
});

router.get('/dashboard', ensureAuth, renderDashboard);
router.get('/transactions', ensureAuth, renderTransactions);
router.get('/categories', ensureAuth, renderCategories);
router.get('/budgets', ensureAuth, renderBudgets);
router.get('/share', ensureAuth, renderShare);

router.post('/categories', ensureAuth, handleCreateCategory);
router.post('/budgets', ensureAuth, handleCreateBudget);
router.post('/transactions', ensureAuth, upload.single('documento'), handleCreateTransaction);
router.post('/share', ensureAuth, handleShare);
router.get('/documents/:id', ensureAuth, handleDownloadDocument);

module.exports = router;

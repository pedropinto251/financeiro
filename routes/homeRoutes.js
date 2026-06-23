const express = require('express');
const { ensureAuth, ensureAdmin } = require('../middleware/authMiddleware');
const {
  renderDashboard,
  renderTransactions,
  renderCategories,
  renderBudgets,
  renderShare,
  renderGoals,
  renderRealEstate,
  renderAdminUsers,
  handleCreateCategory,
  handleUpdateCategory,
  handleDeleteCategory,
  handleCreateBudget,
  handleUpdateBudget,
  handleDeleteBudget,
  handleCreateTransaction,
  handleShare,
  handleDownloadDocument,
  handleUpdateTransaction,
  handleVoidTransaction,
  handleDeleteTransaction,
  handleCreateGoal,
  handleUpdateGoal,
  handleDeleteGoal,
  handleAddAllocation,
  handleUpdateAllocation,
  handleDeleteAllocation,
  handleCreateUser,
  handleUpdateUser,
  handleRealEstateData,
  handleRealEstateLocationsBuild,
  handleExportReport,
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
router.get('/goals', ensureAuth, renderGoals);
router.get('/realestate', ensureAuth, renderRealEstate);
router.get('/realestate/data', ensureAuth, handleRealEstateData);
router.post('/realestate/locations/build', ensureAuth, handleRealEstateLocationsBuild);
router.get('/admin/users', ensureAuth, ensureAdmin, renderAdminUsers);

router.post('/categories', ensureAuth, handleCreateCategory);
router.post('/categories/update', ensureAuth, handleUpdateCategory);
router.post('/categories/delete', ensureAuth, handleDeleteCategory);
router.post('/budgets', ensureAuth, handleCreateBudget);
router.post('/budgets/update', ensureAuth, handleUpdateBudget);
router.post('/budgets/delete', ensureAuth, handleDeleteBudget);
router.post('/transactions', ensureAuth, upload.single('documento'), handleCreateTransaction);
router.post('/share', ensureAuth, handleShare);
router.post('/transactions/update', ensureAuth, upload.single('documento'), handleUpdateTransaction);
router.post('/transactions/void', ensureAuth, handleVoidTransaction);
router.post('/transactions/delete', ensureAuth, handleDeleteTransaction);
router.post('/goals', ensureAuth, handleCreateGoal);
router.post('/goals/update', ensureAuth, handleUpdateGoal);
router.post('/goals/delete', ensureAuth, handleDeleteGoal);
router.post('/goals/allocate', ensureAuth, handleAddAllocation);
router.post('/goals/allocate/update', ensureAuth, handleUpdateAllocation);
router.post('/goals/allocate/delete', ensureAuth, handleDeleteAllocation);
router.post('/admin/users', ensureAuth, ensureAdmin, handleCreateUser);
router.post('/admin/users/update', ensureAuth, ensureAdmin, handleUpdateUser);
router.get('/documents/:id', ensureAuth, handleDownloadDocument);
router.get('/reports/export', ensureAuth, handleExportReport);

module.exports = router;

const express = require('express');
const { ensureAuth, ensureAdmin } = require('../middleware/authMiddleware');
const {
  renderDashboard,
  renderTransactions,
  renderCategories,
  renderBudgets,
  renderShare,
  renderWishlist,
  renderGoals,
  renderAdminUsers,
  handleCreateCategory,
  handleCreateBudget,
  handleCreateTransaction,
  handleShare,
  handleDownloadDocument,
  handleCreateWishlist,
  handleMarkWishlistPurchased,
  handleCreateWishlistProject,
  handleCreateWishlistList,
  handleWishlistImage,
  handleCreateWishlistShare,
  handleUpdateTransaction,
  handleVoidTransaction,
  handleDeleteTransaction,
  handleUpdateWishlistItem,
  handleDeleteWishlistItem,
  handleRevertWishlistItem,
  handleCreateGoal,
  handleUpdateGoal,
  handleDeleteGoal,
  handleAddAllocation,
  handleUpdateAllocation,
  handleDeleteAllocation,
  handleCreateUser,
  handleUpdateUser,
} = require('../controllers/financeController');
const upload = require('../config/upload');
const wishlistUpload = require('../config/wishlistUpload');

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
router.get('/wishlist', ensureAuth, renderWishlist);
router.get('/goals', ensureAuth, renderGoals);
router.get('/admin/users', ensureAuth, ensureAdmin, renderAdminUsers);

router.post('/categories', ensureAuth, handleCreateCategory);
router.post('/budgets', ensureAuth, handleCreateBudget);
router.post('/transactions', ensureAuth, upload.single('documento'), handleCreateTransaction);
router.post('/share', ensureAuth, handleShare);
router.post('/wishlist', ensureAuth, wishlistUpload.single('image'), handleCreateWishlist);
router.post('/wishlist/purchased', ensureAuth, handleMarkWishlistPurchased);
router.post('/wishlist/project', ensureAuth, handleCreateWishlistProject);
router.post('/wishlist/list', ensureAuth, handleCreateWishlistList);
router.post('/wishlist/share', ensureAuth, handleCreateWishlistShare);
router.get('/wishlist/image/:id', ensureAuth, handleWishlistImage);
router.post('/transactions/update', ensureAuth, handleUpdateTransaction);
router.post('/transactions/void', ensureAuth, handleVoidTransaction);
router.post('/transactions/delete', ensureAuth, handleDeleteTransaction);
router.post('/wishlist/update', ensureAuth, handleUpdateWishlistItem);
router.post('/wishlist/delete', ensureAuth, handleDeleteWishlistItem);
router.post('/wishlist/revert', ensureAuth, handleRevertWishlistItem);
router.post('/goals', ensureAuth, handleCreateGoal);
router.post('/goals/update', ensureAuth, handleUpdateGoal);
router.post('/goals/delete', ensureAuth, handleDeleteGoal);
router.post('/goals/allocate', ensureAuth, handleAddAllocation);
router.post('/goals/allocate/update', ensureAuth, handleUpdateAllocation);
router.post('/goals/allocate/delete', ensureAuth, handleDeleteAllocation);
router.post('/admin/users', ensureAuth, ensureAdmin, handleCreateUser);
router.post('/admin/users/update', ensureAuth, ensureAdmin, handleUpdateUser);
router.get('/documents/:id', ensureAuth, handleDownloadDocument);

module.exports = router;

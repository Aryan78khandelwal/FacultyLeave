const express = require('express');
const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  updateUserProfile,
} = require('../controllers/userController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { createUserValidator, updateProfileValidator } = require('../validators/validators');

const router = express.Router();

// User profile self-update (Accessible to logged-in users)
router.put('/profile', protect, updateProfileValidator, updateUserProfile);

// Admin-specific operations
router.route('/')
  .get(protect, authorize('Admin'), getUsers)
  .post(protect, authorize('Admin'), createUserValidator, createUser);

router.route('/:id')
  .get(protect, authorize('Admin'), getUserById)
  .put(protect, authorize('Admin', 'HOD'), updateUser)
  .delete(protect, authorize('Admin'), deleteUser);

module.exports = router;

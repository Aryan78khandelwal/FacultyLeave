const express = require('express');
const {
  loginUser,
  getCurrentUser,
  forgotPassword,
  resetPassword,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { loginValidator } = require('../validators/validators');

const router = express.Router();

router.post('/login', loginValidator, loginUser);
router.get('/me', protect, getCurrentUser);
router.post('/forgotpassword', forgotPassword);
router.put('/resetpassword/:resettoken', resetPassword);

module.exports = router;

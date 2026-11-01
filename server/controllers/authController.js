const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const { enqueueNotification } = require('../utils/enqueueNotification');
const { encryptSensitive } = require('../utils/cryptoHelper');
const { addToBlocklist } = require('../utils/tokenBlocklist');

// Generate JWT token helper
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Check for user email (include password)
    const user = await User.findOne({ email }).select('+password').populate('department');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Generate token
    const token = generateToken(user._id);

    // Remove password from response
    const userObj = user.toObject();
    delete userObj.password;

    res.status(200).json({
      success: true,
      token,
      user: userObj,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
const getCurrentUser = async (req, res, next) => {
  try {
    // req.user is already populated by authMiddleware
    res.status(200).json({
      success: true,
      user: req.user,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Forgot Password - get token & send email
// @route   POST /api/auth/forgotpassword
// @access  Public
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ success: false, message: 'There is no user with that email' });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(20).toString('hex');

    // Hash token and set to resetPasswordToken field
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Set expire: 10 minutes
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

    // Wrap token save + outbox insert in a transaction for atomicity
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await user.save({ validateBeforeSave: false, session });

        await enqueueNotification('password-reset', {
          userId: user._id,
          userEmail: user.email,
          userName: user.name,
          encryptedResetToken: encryptSensitive(resetToken),
          expiresAt: user.resetPasswordExpire,
        }, { session });
      });
    } catch (txErr) {
      await session.endSession();
      throw txErr;
    }
    await session.endSession();

    res.status(200).json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Reset password using token
// @route   PUT /api/auth/resetpassword/:resettoken
// @access  Public
const resetPassword = async (req, res, next) => {
  try {
    // Get hashed token
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(req.params.resettoken)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired password reset token' });
    }

    // Set new password (will be automatically hashed by pre-save hook)
    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password reset successful. You can now log in.',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Logout — revoke current JWT in the server-side blocklist
// @route   POST /api/auth/logout
// @access  Private
const logoutUser = (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      const decoded = jwt.decode(token);
      // decoded.exp is seconds; convert to ms for Date.now() comparison
      const expMs = decoded?.exp ? decoded.exp * 1000 : Date.now() + 7 * 24 * 60 * 60 * 1000;
      addToBlocklist(token, expMs);
    }
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    res.status(200).json({ success: true, message: 'Logged out' });
  }
};

module.exports = {
  loginUser,
  logoutUser,
  getCurrentUser,
  forgotPassword,
  resetPassword,
};

const express = require('express');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

// @desc    Serve uploaded file with authentication
// @route   GET /api/files/:filename?token=<jwt>
// @access  Private (token via query param — required for <a href> browser navigation)
router.get('/:filename', async (req, res) => {
  try {
    // Accept token from query param (browser links cannot set Authorization headers)
    const token = req.query.token;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authorized, no token provided' });
    }

    // Verify JWT
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: 'Not authorized, token invalid or expired' });
    }

    // Verify user still exists
    const user = await User.findById(decoded.id).select('_id role');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Not authorized, user not found' });
    }

    // Sanitize filename — prevent path traversal attacks (e.g. "../../etc/passwd")
    const filename = path.basename(req.params.filename);
    const filePath = path.join(__dirname, '../uploads', filename);

    // Check file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    // Stream the file to the response
    res.sendFile(filePath);
  } catch (error) {
    console.error('File serve error:', error);
    res.status(500).json({ success: false, message: 'Server error while serving file' });
  }
});

module.exports = router;

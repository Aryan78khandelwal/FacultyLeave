const express = require('express');
const path = require('path');
const fs = require('fs');
const { protect } = require('../middleware/authMiddleware');
const LeaveRequest = require('../models/LeaveRequest');

const router = express.Router();

/**
 * @desc    Serve uploaded leave supporting document or certificate with strict resource-level authorization
 * @route   GET /api/files/:filename
 * @access  Private (Bearer token via Authorization header ONLY)
 */
router.get('/:filename', protect, async (req, res) => {
  try {
    const rawParam = req.params.filename;
    if (!rawParam || typeof rawParam !== 'string') {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    // Sanitize filename — prevent path traversal attacks
    const filename = path.basename(rawParam);
    if (!filename || filename === '.' || filename === '..') {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    const uploadsDir = path.resolve(__dirname, '../uploads');
    const filePath = path.resolve(uploadsDir, filename);

    // Defense-in-depth: ensure filePath cannot escape the uploads directory
    if (!filePath.startsWith(uploadsDir + path.sep)) {
      return res.status(403).json({ success: false, message: 'Invalid file path' });
    }

    // Find the LeaveRequest whose documents or certificateDocument matches the requested file path
    const matchingPaths = [
      `/uploads/${filename}`,
      `uploads/${filename}`,
      filename,
    ];

    const leave = await LeaveRequest.findOne({
      $or: [
        { documents: { $in: matchingPaths } },
        { certificateDocument: { $in: matchingPaths } },
      ],
    }).populate({
      path: 'facultyId',
      select: '_id name email role department',
      populate: { path: 'department', select: '_id name hod facultyList' },
    });

    // Return 404 if no leave request references this file (avoids leaking file existence on disk)
    if (!leave) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    // Determine authorization according to project leave-access rules
    const leaveFacultyId = leave.facultyId
      ? (leave.facultyId._id ? leave.facultyId._id.toString() : leave.facultyId.toString())
      : null;
    const currentUserId = req.user._id.toString();

    let isAuthorized = false;

    // 1. Admin: full access across all leave requests
    if (req.user.role === 'Admin') {
      isAuthorized = true;
    }
    // 2. Resource owner: Faculty, Instructor, SDA (and HOD for their own leave requests)
    else if (leaveFacultyId && leaveFacultyId === currentUserId) {
      isAuthorized = true;
    }
    // 3. HOD: may access files for faculty in their department
    else if (req.user.role === 'HOD') {
      if (req.user.department) {
        const userDeptId = req.user.department._id
          ? req.user.department._id.toString()
          : req.user.department.toString();

        const facultyDeptId = leave.facultyId?.department?._id
          ? leave.facultyId.department._id.toString()
          : (leave.facultyId?.department ? leave.facultyId.department.toString() : null);

        const isSameDept = Boolean(userDeptId && facultyDeptId && userDeptId === facultyDeptId);

        const isFacultyInDeptList =
          Array.isArray(req.user.department.facultyList) &&
          req.user.department.facultyList.some(
            (id) => (id._id ? id._id.toString() : id.toString()) === leaveFacultyId
          );

        if (isSameDept || isFacultyInDeptList) {
          isAuthorized = true;
        }
      }
    }

    // Deny all unauthorized access with 403
    if (!isAuthorized) {
      return res.status(403).json({ success: false, message: 'Not authorized to access this file' });
    }

    // Check physical file existence on disk only after authorization succeeds
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    // Stream the file safely to the client
    res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) {
        console.error('File send error:', err.message);
        res.status(500).json({ success: false, message: 'Error serving file' });
      }
    });
  } catch (error) {
    console.error('File serve error:', error.message);
    res.status(500).json({ success: false, message: 'Server error while serving file' });
  }
});

module.exports = router;

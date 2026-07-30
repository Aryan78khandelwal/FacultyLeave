const mongoose = require('mongoose');
const LeaveRequest = require('../models/LeaveRequest');
const User = require('../models/User');
const Department = require('../models/Department');
const { sendLeaveAppliedEmail, sendLeaveApprovedEmail, sendLeaveRejectedEmail } = require('../services/emailService');

// Helper to calculate total calendar days between dates (inclusive)
const calculateTotalDays = (start, end) => {
  const sDate = new Date(start);
  const eDate = new Date(end);
  const diffTime = Math.abs(eDate - sDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return diffDays;
};

// @desc    Apply for a leave
// @route   POST /api/leaves
// @access  Private/Faculty or HOD
const applyLeave = async (req, res, next) => {
  try {
    const { leaveType, startDate, endDate, reason } = req.body;
    const facultyId = req.user._id;

    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({ success: false, message: 'Start date must be before or equal to end date' });
    }

    const totalDays = calculateTotalDays(startDate, endDate);

    // Check for overlapping leave requests (status: pending or approved)
    const overlappingRequest = await LeaveRequest.findOne({
      facultyId,
      status: { $in: ['pending', 'approved'] },
      $or: [
        {
          startDate: { $lte: new Date(endDate) },
          endDate: { $gte: new Date(startDate) },
        },
      ],
    });

    if (overlappingRequest) {
      const startStr = new Date(overlappingRequest.startDate).toLocaleDateString();
      const endStr = new Date(overlappingRequest.endDate).toLocaleDateString();
      return res.status(400).json({
        success: false,
        message: `You already have a ${overlappingRequest.status} leave request overlapping this duration (${startStr} to ${endStr}).`,
      });
    }

    // Get current user to check balance
    const user = await User.findById(facultyId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Faculty user not found' });
    }

    const availableBalance = user.leaveBalance[leaveType];

    // Calculate currently pending leaves of this type to avoid over-commitment
    const pendingLeaves = await LeaveRequest.find({
      facultyId,
      leaveType,
      status: 'pending',
    });

    const pendingDays = pendingLeaves.reduce((acc, request) => acc + request.totalDays, 0);

    if (availableBalance < (pendingDays + totalDays)) {
      return res.status(400).json({
        success: false,
        message: `Insufficient leave balance. Available: ${availableBalance} days. Pending requests already consume: ${pendingDays} days. Requested: ${totalDays} days.`,
      });
    }

    let documentPath = '';
    if (req.file) {
      // Relative path to be served statically
      documentPath = `/uploads/${req.file.filename}`;
    }

    const leaveRequest = await LeaveRequest.create({
      facultyId,
      leaveType,
      startDate,
      endDate,
      totalDays,
      reason,
      documents: documentPath,
    });

    // Notify Department HOD
    if (user.department) {
      const dept = await Department.findById(user.department).populate('hod', 'name email');
      if (dept && dept.hod) {
        try {
          await sendLeaveAppliedEmail(
            dept.hod.email,
            dept.hod.name,
            user.name,
            leaveRequest
          );
        } catch (err) {
          console.error('Notification email failed:', err.message);
        }
      }
    }

    res.status(201).json({
      success: true,
      message: 'Leave application submitted successfully',
      leaveRequest,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get leave requests with filter, sorting, pagination
// @route   GET /api/leaves
// @access  Private
const getLeaves = async (req, res, next) => {
  try {
    const { status, leaveType, facultyId, page = 1, limit = 10 } = req.query;
    const query = {};

    // 1. Role-based restrictions
    if (req.user.role === 'Faculty') {
      query.facultyId = req.user._id;
    } else if (req.user.role === 'HOD') {
      // HOD sees leaves of all users in their department
      if (!req.user.department) {
        return res.status(200).json({ success: true, count: 0, leaves: [], totalPages: 0 });
      }
      
      const facultyInDept = await User.find({ department: req.user.department._id }).select('_id');
      const facultyIds = facultyInDept.map((f) => f._id);
      
      // HOD can see their own leaves AND department leaves
      query.facultyId = { $in: facultyIds };
    }

    // 2. Apply filters if provided
    if (status) {
      query.status = status;
    }
    if (leaveType) {
      query.leaveType = leaveType;
    }
    if (facultyId && req.user.role !== 'Faculty') {
      query.facultyId = facultyId;
    }

    const skipIndex = (page - 1) * limit;

    const totalLeaves = await LeaveRequest.countDocuments(query);
    const leaves = await LeaveRequest.find(query)
      .populate('facultyId', 'name email employeeId designation department')
      .populate({
        path: 'facultyId',
        populate: { path: 'department', select: 'name' }
      })
      .populate('approvedBy', 'name role')
      .skip(skipIndex)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: leaves.length,
      totalPages: Math.ceil(totalLeaves / limit),
      currentPage: parseInt(page),
      totalLeaves,
      leaves,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single leave request details
// @route   GET /api/leaves/:id
// @access  Private
const getLeaveById = async (req, res, next) => {
  try {
    const leave = await LeaveRequest.findById(req.params.id)
      .populate('facultyId', 'name email employeeId designation department')
      .populate({
        path: 'facultyId',
        populate: { path: 'department', select: 'name' }
      })
      .populate('approvedBy', 'name role');

    if (!leave) {
      return res.status(404).json({ success: false, message: 'Leave request not found' });
    }

    // Role verification
    if (req.user.role === 'Faculty' && leave.facultyId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this leave request' });
    }

    if (req.user.role === 'HOD') {
      const isDeptMember = leave.facultyId.department && leave.facultyId.department._id.toString() === req.user.department._id.toString();
      if (!isDeptMember && leave.facultyId._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized to view leaves outside your department' });
      }
    }

    res.status(200).json({ success: true, leave });
  } catch (error) {
    next(error);
  }
};

// @desc    Review leave request (Approve/Reject)
// @route   PUT /api/leaves/:id/review
// @access  Private/HOD or Admin
const reviewLeave = async (req, res, next) => {
  try {
    const { status, rejectionReason } = req.body;
    const leave = await LeaveRequest.findById(req.params.id).populate('facultyId');

    if (!leave) {
      return res.status(404).json({ success: false, message: 'Leave request not found' });
    }

    if (leave.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Leave request has already been processed' });
    }

    // Verify HOD authority over faculty
    if (req.user.role === 'HOD') {
      if (!leave.facultyId.department || leave.facultyId.department.toString() !== req.user.department._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized to review leaves outside your department' });
      }
    }

    // Process Approval
    if (status === 'approved') {
      const faculty = await User.findById(leave.facultyId._id);
      
      // Double check balance just in case
      if (faculty.leaveBalance[leave.leaveType] < leave.totalDays) {
        return res.status(400).json({
          success: false,
          message: `Cannot approve. Faculty member has insufficient balance of ${leave.leaveType} leave. Current Balance: ${faculty.leaveBalance[leave.leaveType]} days. Request requires: ${leave.totalDays} days.`,
        });
      }

      // Deduct balance
      faculty.leaveBalance[leave.leaveType] -= leave.totalDays;
      await faculty.save();

      leave.status = 'approved';
      leave.approvedBy = req.user._id;
      await leave.save();

      // Send Email
      try {
        await sendLeaveApprovedEmail(faculty.email, faculty.name, leave, req.user.name);
      } catch (err) {
        console.error('Approved email error:', err.message);
      }
    } 
    // Process Rejection
    else if (status === 'rejected') {
      if (!rejectionReason) {
        return res.status(400).json({ success: false, message: 'Please provide a rejection reason' });
      }

      leave.status = 'rejected';
      leave.rejectionReason = rejectionReason;
      leave.approvedBy = req.user._id;
      await leave.save();

      // Send Email
      try {
        await sendLeaveRejectedEmail(leave.facultyId.email, leave.facultyId.name, leave, req.user.name);
      } catch (err) {
        console.error('Rejected email error:', err.message);
      }
    } else {
      return res.status(400).json({ success: false, message: "Status must be 'approved' or 'rejected'" });
    }

    res.status(200).json({ success: true, message: `Leave request status updated to ${status}`, leave });
  } catch (error) {
    next(error);
  }
};

// @desc    Get analytics statistics for dashboard
// @route   GET /api/leaves/analytics
// @access  Private
const getLeaveAnalytics = async (req, res, next) => {
  try {
    // 1. Set scope filters depending on user role
    let scopeQuery = {};

    if (req.user.role === 'Faculty') {
      scopeQuery.facultyId = req.user._id;
    } else if (req.user.role === 'HOD') {
      if (!req.user.department) {
        return res.status(200).json({ success: true, stats: {} });
      }
      const departmentFaculty = await User.find({ department: req.user.department._id }).select('_id');
      const facultyIds = departmentFaculty.map((f) => f._id);
      scopeQuery.facultyId = { $in: facultyIds };
    }

    // A. Approved vs Rejected Ratio
    const statusStats = await LeaveRequest.aggregate([
      { $match: scopeQuery },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    // B. Leave Type Distribution
    const typeStats = await LeaveRequest.aggregate([
      { $match: scopeQuery },
      { $group: { _id: '$leaveType', count: { $sum: 1 }, totalDays: { $sum: '$totalDays' } } },
    ]);

    // C. Monthly Leave Trends (Last 6 Months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const monthlyStats = await LeaveRequest.aggregate([
      {
        $match: {
          ...scopeQuery,
          startDate: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$startDate' },
            month: { $month: '$startDate' },
          },
          count: { $sum: 1 },
          days: { $sum: '$totalDays' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    // D. Department-wise Leave Stats (Admin Only)
    let deptStats = [];
    if (req.user.role === 'Admin') {
      deptStats = await LeaveRequest.aggregate([
        {
          $lookup: {
            from: 'users',
            localField: 'facultyId',
            foreignField: '_id',
            as: 'faculty',
          },
        },
        { $unwind: '$faculty' },
        {
          $lookup: {
            from: 'departments',
            localField: 'faculty.department',
            foreignField: '_id',
            as: 'dept',
          },
        },
        { $unwind: { path: '$dept', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: { $ifNull: ['$dept.name', 'Unassigned'] },
            count: { $sum: 1 },
            days: { $sum: '$totalDays' },
          },
        },
      ]);
    }

    // E. Faculty Leave Usage (HOD and Admin view)
    let usageStats = [];
    if (req.user.role !== 'Faculty') {
      usageStats = await User.find(
        req.user.role === 'HOD' ? { department: req.user.department._id } : {}
      )
        .select('name employeeId designation leaveBalance')
        .populate('department', 'name')
        .limit(10);
    }

    res.status(200).json({
      success: true,
      stats: {
        statusStats,
        typeStats,
        monthlyStats,
        deptStats,
        usageStats,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get leaves formatted for FullCalendar.js
// @route   GET /api/leaves/calendar
// @access  Private
const getCalendarLeaves = async (req, res, next) => {
  try {
    let query = { status: 'approved' }; // Only show approved leaves on the calendars by default, or pending too? Color coding will handle it. Let's include both approved and pending so HODs and Faculty can view upcoming scheduled blocks.

    if (req.user.role === 'Faculty') {
      query.facultyId = req.user._id;
    } else if (req.user.role === 'HOD') {
      if (!req.user.department) {
        return res.status(200).json({ success: true, events: [] });
      }
      const departmentFaculty = await User.find({ department: req.user.department._id }).select('_id');
      const facultyIds = departmentFaculty.map((f) => f._id);
      query.facultyId = { $in: facultyIds };
    }

    const leaves = await LeaveRequest.find(query).populate('facultyId', 'name designation');

    // Format events for FullCalendar: id, title, start, end, color
    const events = leaves.map((leave) => {
      let color = '#3b82f6'; // Blue for casual
      if (leave.leaveType === 'sick') color = '#ef4444'; // Red for sick
      if (leave.leaveType === 'earned') color = '#10b981'; // Green for earned

      // Modify color opacity/style based on pending status
      if (leave.status === 'pending') {
        color = '#f59e0b'; // Amber for pending
      }

      // FullCalendar end date is exclusive. To make it inclusive on layout, we add 1 day
      const endDateExclusive = new Date(leave.endDate);
      endDateExclusive.setDate(endDateExclusive.getDate() + 1);

      return {
        id: leave._id,
        title: `${leave.facultyId ? leave.facultyId.name : 'Unknown'} - ${leave.leaveType.toUpperCase()} (${leave.status})`,
        start: leave.startDate.toISOString().split('T')[0],
        end: endDateExclusive.toISOString().split('T')[0],
        backgroundColor: color,
        borderColor: color,
        allDay: true,
        extendedProps: {
          facultyName: leave.facultyId ? leave.facultyId.name : 'Unknown',
          reason: leave.reason,
          status: leave.status,
          leaveType: leave.leaveType,
          totalDays: leave.totalDays,
        },
      };
    });

    res.status(200).json({ success: true, events });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  applyLeave,
  getLeaves,
  getLeaveById,
  reviewLeave,
  getLeaveAnalytics,
  getCalendarLeaves,
};

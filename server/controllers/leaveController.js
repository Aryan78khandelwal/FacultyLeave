const mongoose = require('mongoose');
const LeaveRequest = require('../models/LeaveRequest');
const User = require('../models/User');
const Department = require('../models/Department');
const { sendLeaveAppliedEmail, sendLeaveApprovedEmail, sendLeaveRejectedEmail, sendLeaveTemporarilyApprovedEmail } = require('../services/emailService');

// Helper to calculate leave days minus holidays (Sundays, 1st & 3rd Saturdays)
const calculateLeaveDays = (start, end) => {
  const sDate = new Date(start);
  const eDate = new Date(end);
  sDate.setHours(0, 0, 0, 0);
  eDate.setHours(0, 0, 0, 0);

  let calendarDays = 0;
  let leaveDays = 0;
  const excludedDates = [];

  const currentDate = new Date(sDate);
  while (currentDate <= eDate) {
    calendarDays++;
    const dayOfWeek = currentDate.getDay(); // 0 is Sunday, 6 is Saturday

    if (dayOfWeek === 0) {
      excludedDates.push({ date: new Date(currentDate), reason: 'Sunday' });
    } else if (dayOfWeek === 6) {
      const weekOfMonth = Math.ceil(currentDate.getDate() / 7);
      if (weekOfMonth === 1) {
        excludedDates.push({ date: new Date(currentDate), reason: '1st Saturday' });
      } else if (weekOfMonth === 3) {
        excludedDates.push({ date: new Date(currentDate), reason: '3rd Saturday' });
      } else {
        leaveDays++;
      }
    } else {
      leaveDays++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return { calendarDays, leaveDays, excludedDates };
};

// Helper to check if a date is a working day (not Sunday, not 1st/3rd Saturday)
const isWorkingDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dayOfWeek = d.getDay();
  if (dayOfWeek === 0) return false; // Sunday
  if (dayOfWeek === 6) {
    const weekOfMonth = Math.ceil(d.getDate() / 7);
    if (weekOfMonth === 1 || weekOfMonth === 3) return false; // 1st or 3rd Saturday
  }
  return true;
};

/**
 * Normalise a leave document for API responses.
 * Guarantees calendarDays and excludedDates are always present
 * so UI code never crashes on old records that predate these fields.
 */
const normaliseLeave = (leave) => {
  const obj = leave.toObject ? leave.toObject() : { ...leave };
  if (obj.calendarDays == null) obj.calendarDays = obj.totalDays || 0;
  if (!Array.isArray(obj.excludedDates)) obj.excludedDates = [];
  return obj;
};

// @desc    Apply for a leave
// @route   POST /api/leaves
// @access  Private/Faculty or HOD
const applyLeave = async (req, res, next) => {
  try {
    const { leaveType, startDate, endDate, reason, duration = 'FULL_DAY', halfDayType = null } = req.body;
    const facultyId = req.user._id;

    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({ success: false, message: 'Start date must be before or equal to end date' });
    }

    // --- Half-day leave handling ---
    let totalDays, calendarDays, excludedDates;
    if (duration === 'HALF_DAY') {
      if (!isWorkingDay(startDate)) {
        return res.status(400).json({ success: false, message: 'Half-day leave cannot be applied on a holiday or weekend.' });
      }
      totalDays = 0.5;
      calendarDays = 1;
      excludedDates = [];
    } else {
      const result = calculateLeaveDays(startDate, endDate);
      calendarDays = result.calendarDays;
      totalDays = result.leaveDays;
      excludedDates = result.excludedDates;
    }

    if (totalDays === 0) {
      return res.status(400).json({ success: false, message: 'Selected date range contains only holidays. Leave days cannot be 0.' });
    }

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

    if (leaveType === 'earned' && user.earnedLeaveEnabled === false) {
      return res.status(400).json({ success: false, message: 'Earned leave is disabled for your account by administrator.' });
    }
    if (leaveType === 'restricted' && user.restrictedLeaveEnabled === false) {
      return res.status(400).json({ success: false, message: 'Restricted leave is disabled for your account by administrator.' });
    }
    if (leaveType === 'vacation' && user.vacationLeaveEnabled === false) {
      return res.status(400).json({ success: false, message: 'Vacation leave is disabled for your account by administrator.' });
    }
    if (leaveType === 'ood' && user.oodLeaveEnabled === false) {
      return res.status(400).json({ success: false, message: 'OOD leave is disabled for your account by administrator.' });
    }

    let availableBalance = user.leaveBalance[leaveType];
    if (availableBalance === undefined) {
      if (leaveType === 'vacation') availableBalance = user.role === 'HOD' ? 0 : 11;
      else if (leaveType === 'casual') availableBalance = 12;
      else if (leaveType === 'restricted') availableBalance = 10;
      else if (leaveType === 'earned') availableBalance = 15;
      else if (leaveType === 'ood') availableBalance = 10;
      else availableBalance = 0;
    }

    // Calculate currently pending leaves of this type to avoid over-commitment
    const pendingLeaves = await LeaveRequest.find({
      facultyId,
      leaveType,
      status: 'pending',
    });

    const pendingDays = pendingLeaves.reduce((acc, request) => acc + request.totalDays, 0);

    let isPaidLeave = false;
    if (availableBalance < (pendingDays + totalDays)) {
      if (leaveType === 'casual') {
        isPaidLeave = true;
      } else {
        return res.status(400).json({
          success: false,
          message: `Insufficient leave balance. Available: ${availableBalance} days. Pending requests already consume: ${pendingDays} days. Requested: ${totalDays} days.`,
        });
      }
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
      calendarDays,
      excludedDates,
      reason,
      documents: documentPath,
      isPaidLeave,
      duration,
      halfDayType: duration === 'HALF_DAY' ? halfDayType : null,
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
    const { status, leaveType, facultyId, page = 1, limit = 10, activeToday } = req.query;
    const query = {};

    // 1. Role-based restrictions
    if (['Faculty', 'Instructor', 'SDA'].includes(req.user.role)) {
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
      // Support comma-separated statuses: e.g. ?status=pending,certificate_submitted
      const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
      query.status = statuses.length === 1 ? statuses[0] : { $in: statuses };
    }
    if (leaveType) {
      query.leaveType = leaveType;
    }
    if (facultyId && !['Faculty', 'Instructor', 'SDA'].includes(req.user.role)) {
      query.facultyId = facultyId;
    }
    // Support activeToday filter: only return leaves whose date range covers today
    if (activeToday === 'true') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      query.startDate = { $lte: tomorrow };
      query.endDate = { $gte: today };
    }

    // Support limit=all to bypass pagination (for dashboard summary queries)
    const isUnlimited = limit === 'all';
    const parsedLimit = isUnlimited ? 0 : parseInt(limit);
    const skipIndex = isUnlimited ? 0 : (page - 1) * parsedLimit;

    const totalLeaves = await LeaveRequest.countDocuments(query);
    const leavesQuery = LeaveRequest.find(query)
      .populate('facultyId', 'name email employeeId designation department')
      .populate({
        path: 'facultyId',
        populate: { path: 'department', select: 'name' }
      })
      .populate('approvedBy', 'name role')
      .skip(skipIndex)
      .sort({ createdAt: -1 });
    if (!isUnlimited) leavesQuery.limit(parsedLimit);
    const leaves = await leavesQuery;

    const normalisedLeaves = leaves.map(normaliseLeave);

    res.status(200).json({
      success: true,
      count: normalisedLeaves.length,
      totalPages: isUnlimited ? 1 : Math.ceil(totalLeaves / parsedLimit),
      currentPage: isUnlimited ? 1 : parseInt(page),
      totalLeaves,
      leaves: normalisedLeaves,
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
    if (['Faculty', 'Instructor', 'SDA'].includes(req.user.role) && leave.facultyId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this leave request' });
    }

    if (req.user.role === 'HOD') {
      const isDeptMember = leave.facultyId.department && leave.facultyId.department._id.toString() === req.user.department._id.toString();
      if (!isDeptMember && leave.facultyId._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized to view leaves outside your department' });
      }
    }

    res.status(200).json({ success: true, leave: normaliseLeave(leave) });
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

    // 'approved' is also included so an Admin can reject an already-approved leave and trigger a balance rollback.
    const reviewableStatuses = ['pending', 'certificate_submitted', 'approved'];
    if (!reviewableStatuses.includes(leave.status)) {
      return res.status(400).json({ success: false, message: 'Leave request cannot be reviewed in its current state' });
    }

    // HODs may not re-review an already-approved leave — only Admins can do that.
    if (req.user.role === 'HOD' && leave.status === 'approved') {
      return res.status(403).json({ success: false, message: 'HODs cannot reject a leave that has already been approved.' });
    }


    // Verify HOD authority over faculty using department membership query —
    // this covers all roles (Faculty, Instructor, SDA) uniformly, even if
    // the user's department field is not set (relies on facultyList instead).
    if (req.user.role === 'HOD') {
      if (!req.user.department) {
        return res.status(403).json({ success: false, message: 'Your account is not assigned to any department' });
      }
      const dept = await Department.findById(req.user.department._id).select('facultyList hod');
      const isMember =
        dept &&
        (dept.facultyList.some((id) => id.toString() === leave.facultyId._id.toString()) ||
          (dept.hod && dept.hod.toString() === leave.facultyId._id.toString()));
      if (!isMember) {
        return res.status(403).json({ success: false, message: 'Not authorized to review leaves outside your department' });
      }
    }


    if (status === 'temporarily_approved' || status === 'approved') {
      const facultyToCheck = await User.findById(leave.facultyId._id);
      if (leave.leaveType === 'earned' && facultyToCheck.earnedLeaveEnabled === false) {
        return res.status(400).json({ success: false, message: 'Cannot approve. Earned leave is currently disabled for this account.' });
      }
      if (leave.leaveType === 'restricted' && facultyToCheck.restrictedLeaveEnabled === false) {
        return res.status(400).json({ success: false, message: 'Cannot approve. Restricted leave is currently disabled for this account.' });
      }
      if (leave.leaveType === 'vacation' && facultyToCheck.vacationLeaveEnabled === false) {
        return res.status(400).json({ success: false, message: 'Cannot approve. Vacation leave is currently disabled for this account.' });
      }
      if (leave.leaveType === 'ood' && facultyToCheck.oodLeaveEnabled === false) {
        return res.status(400).json({ success: false, message: 'Cannot approve. OOD leave is currently disabled for this account.' });
      }
    }

    // Process Temporarily Approved (OOD ONLY)
    if (status === 'temporarily_approved') {
      if (leave.leaveType !== 'ood') {
        return res.status(400).json({ success: false, message: 'Only OOD leaves can be temporarily approved' });
      }
      leave.status = 'temporarily_approved';
      leave.approvedBy = req.user._id;
      await leave.save();

      // Send Email
      try {
        await sendLeaveTemporarilyApprovedEmail(leave.facultyId.email, leave.facultyId.name, leave, req.user.name);
      } catch (err) {
        console.error('Temporarily approved email error:', err.message);
      }
    }
    // Process Approval
    else if (status === 'approved') {
      const faculty = await User.findById(leave.facultyId._id);
      
      // Double check balance just in case
      if (faculty.leaveBalance[leave.leaveType] < leave.totalDays && leave.leaveType !== 'casual') {
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
    else if (status === 'rejected' || status === 'certificate_rejected') {
      if (!rejectionReason) {
        return res.status(400).json({ success: false, message: 'Please provide a rejection reason' });
      }

      // Rollback balance if leave was already approved (balance was previously deducted)
      // This covers the case where an approved leave is being certificate_rejected
      // or any future scenario where an approved leave is reverted.
      if (leave.status === 'approved') {
        const faculty = await User.findById(leave.facultyId._id);
        faculty.leaveBalance[leave.leaveType] += leave.totalDays;
        faculty.markModified('leaveBalance');
        await faculty.save();
      }

      leave.status = status;
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
      return res.status(400).json({ success: false, message: "Invalid status update requested" });
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

    if (['Faculty', 'Instructor', 'SDA'].includes(req.user.role)) {
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
    if (!['Faculty', 'Instructor', 'SDA'].includes(req.user.role)) {
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
    let query = { status: { $in: ['approved', 'pending'] } }; // Include both approved and pending so HODs and Faculty can view upcoming scheduled blocks. Color coding distinguishes them.

    if (['Faculty', 'Instructor', 'SDA'].includes(req.user.role)) {
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
      const isHalfDay = leave.duration === 'HALF_DAY';

      // Full-day colors
      let color = '#3b82f6'; // Blue for casual
      if (leave.leaveType === 'restricted') color = '#ef4444'; // Red for restricted
      if (leave.leaveType === 'earned') color = '#10b981'; // Green for earned
      if (leave.leaveType === 'vacation') color = '#f97316'; // Orange for vacation

      // Half-day uses lighter shade of the same hue
      if (isHalfDay) {
        if (leave.leaveType === 'casual') color = '#93c5fd';   // lighter blue
        else if (leave.leaveType === 'earned') color = '#6ee7b7'; // lighter emerald
      }

      // Pending overrides to amber (half-day pending = lighter amber)
      if (leave.status === 'pending') {
        color = isHalfDay ? '#fcd34d' : '#f59e0b';
      }

      // FullCalendar end date is exclusive. To make it inclusive on layout, we add 1 day
      const endDateExclusive = new Date(leave.endDate);
      endDateExclusive.setDate(endDateExclusive.getDate() + 1);

      // Build a descriptive title
      const halfLabel = isHalfDay
        ? ` [½ ${leave.halfDayType === 'FIRST_HALF' ? 'AM' : 'PM'}]`
        : '';
      const title = `${leave.facultyId ? leave.facultyId.name : 'Unknown'} - ${leave.leaveType.toUpperCase()}${halfLabel} (${leave.status})`;

      return {
        id: leave._id,
        title,
        start: leave.startDate.toISOString().split('T')[0],
        end: endDateExclusive.toISOString().split('T')[0],
        backgroundColor: color,
        borderColor: color,
        allDay: true,
        // Half-day events rendered with a dashed border to distinguish visually
        classNames: isHalfDay ? ['half-day-event'] : [],
        extendedProps: {
          facultyName: leave.facultyId ? leave.facultyId.name : 'Unknown',
          reason: leave.reason,
          status: leave.status,
          leaveType: leave.leaveType,
          totalDays: leave.totalDays,
          duration: leave.duration || 'FULL_DAY',
          halfDayType: leave.halfDayType || null,
        },
      };
    });

    res.status(200).json({ success: true, events });
  } catch (error) {
    next(error);
  }
};

// @desc    Upload certificate for OOD leave
// @route   PUT /api/leaves/:id/certificate
// @access  Private/Faculty
const uploadCertificate = async (req, res, next) => {
  try {
    const leave = await LeaveRequest.findById(req.params.id);

    if (!leave) {
      return res.status(404).json({ success: false, message: 'Leave request not found' });
    }

    if (leave.facultyId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to upload certificate for this request' });
    }

    if (leave.leaveType !== 'ood') {
      return res.status(400).json({ success: false, message: 'Certificate upload is only for OOD leaves' });
    }

    if (leave.status !== 'temporarily_approved' && leave.status !== 'certificate_rejected') {
      return res.status(400).json({ success: false, message: 'Certificate cannot be uploaded at this stage' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please provide a certificate file' });
    }

    const documentPath = `/uploads/${req.file.filename}`;
    
    leave.certificateDocument = documentPath;
    leave.status = 'certificate_submitted';
    await leave.save();

    res.status(200).json({
      success: true,
      message: 'Certificate uploaded successfully',
      leave,
    });
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
  uploadCertificate,
};

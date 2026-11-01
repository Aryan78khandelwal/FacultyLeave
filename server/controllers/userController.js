const mongoose = require('mongoose');
const User = require('../models/User');
const Department = require('../models/Department');
const LeaveRequest = require('../models/LeaveRequest');
const { enqueueNotification } = require('../utils/enqueueNotification');

// Safe number parsers — prevent NaN from empty strings crashing Mongoose
const safeInt = (val, fallback) => { const n = parseInt(val); return isNaN(n) ? fallback : n; };
const safeFloat = (val, fallback) => { const n = parseFloat(val); return isNaN(n) ? fallback : n; };

// @desc    Get all users with filtering, sorting, pagination(it is a technique used to divide a large amount of data into smaller pages instead of sending everything at once.)
// @route   GET /api/users
// @access  Private/Admin
const getUsers = async (req, res, next) => {
  try {
    const { role, department, search, page = 1, limit = 10 } = req.query;

    const query = {};

    // Apply role filter
    if (role) {
      query.role = role;
    }

    // Apply department filter
    if (department) {
      query.department = department;
    }

    // Apply search filter (name, email, or employeeId)
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } },
      ];
    }

    const skipIndex = (page - 1) * limit;

    const totalUsers = await User.countDocuments(query);
    const users = await User.find(query)
      .populate('department', 'name')
      .skip(skipIndex)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: users.length,
      totalPages: Math.ceil(totalUsers / limit),
      currentPage: parseInt(page),
      totalUsers,
      users,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single user details
// @route   GET /api/users/:id
// @access  Private/Admin
const getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).populate('department').lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({ success: true, user });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new user
// @route   POST /api/users
// @access  Private/Admin
const createUser = async (req, res, next) => {
  try {
    const { name, email, role, employeeId, designation, department, leaveBalance } = req.body;

    // Run both duplicate checks concurrently — they are independent reads
    const [emailExists, empIdExists] = await Promise.all([
      User.findOne({ email }).lean(),
      User.findOne({
        employeeId,
        department: role === 'Admin' ? null : (department || null),
      }).lean(),
    ]);

    if (emailExists) {
      return res.status(400).json({ success: false, message: 'Email is already registered' });
    }
    if (empIdExists) {
      return res.status(400).json({ success: false, message: 'Employee ID is already registered in this department' });
    }

    // Initial password set by Admin
    const rawPassword = req.body.password;
    if (!rawPassword || typeof rawPassword !== 'string' || rawPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an initial password with at least 6 characters',
      });
    }

    // Create User object
    const userData = {
      name,
      email,
      password: rawPassword, // will be hashed by pre-save hook
      role,
      employeeId,
      designation,
      department: role === 'Admin' ? null : department || null,
    };

    // If custom leave balances are supplied
    if (leaveBalance) {
      userData.leaveBalance = {
        casual: leaveBalance.casual !== undefined ? safeFloat(leaveBalance.casual, 12) : 12,
        restricted: leaveBalance.restricted !== undefined ? safeInt(leaveBalance.restricted, 10) : 10,
        earned: leaveBalance.earned !== undefined ? safeInt(leaveBalance.earned, 15) : 15,
        vacation: role === 'HOD' ? 0 : (leaveBalance.vacation !== undefined ? safeInt(leaveBalance.vacation, 11) : 11),
      };
    }

    // Apply role-based leave-type restrictions.
    // Instructor and SDA cannot have OOD or Vacation leaves — enforce this server-side
    // regardless of what the frontend sends, so the policy is always consistent.
    const rolesWithoutOodAndVacation = ['Instructor', 'SDA'];
    const isRestrictedRole = rolesWithoutOodAndVacation.includes(role);

    if (req.body.earnedLeaveEnabled !== undefined) {
      userData.earnedLeaveEnabled = Boolean(req.body.earnedLeaveEnabled);
    }
    if (req.body.restrictedLeaveEnabled !== undefined) {
      userData.restrictedLeaveEnabled = Boolean(req.body.restrictedLeaveEnabled);
    }

    // Vacation: explicitly disabled for Instructor/SDA regardless of request body
    if (isRestrictedRole) {
      userData.vacationLeaveEnabled = false;
    } else if (req.body.vacationLeaveEnabled !== undefined) {
      userData.vacationLeaveEnabled = Boolean(req.body.vacationLeaveEnabled);
    }

    // OOD: explicitly disabled for Instructor/SDA regardless of request body
    if (isRestrictedRole) {
      userData.oodLeaveEnabled = false;
    } else if (req.body.oodLeaveEnabled !== undefined) {
      userData.oodLeaveEnabled = Boolean(req.body.oodLeaveEnabled);
    }

    // Wrap user creation + department updates + outbox in a single transaction
    const session = await mongoose.startSession();
    let user;
    try {
      await session.withTransaction(async () => {
        const [created] = await User.create([userData], { session });
        user = created;

        // Update Department relationships if department exists and not admin.
        if (userData.department) {
          const dept = await Department.findById(userData.department).session(session);
          if (dept) {
            // Add to faculty list
            dept.facultyList.addToSet(user._id);

            // If the new user is an HOD, assign them as HOD of the department
            if (role === 'HOD') {
              // If department already has HOD, demote old HOD's role to Faculty
              if (dept.hod && dept.hod.toString() !== user._id.toString()) {
                await User.findByIdAndUpdate(dept.hod, { role: 'Faculty' }, { session });
              }
              dept.hod = user._id;
            }

            await dept.save({ session });
          }
        }

        // Enqueue welcome email inside the transaction (non-sensitive account details only, no password)
        await enqueueNotification('account-created', {
          user: {
            name: user.name,
            email: user.email,
            role: user.role,
            employeeId: user.employeeId,
          },
        }, { session });
      });
    } catch (err) {
      await session.endSession();
      // Handle concurrent duplicate-key race that slips past the pre-checks
      if (err.code === 11000) {
        const field = err.keyPattern && Object.keys(err.keyPattern)[0];
        const msg = field === 'email'
          ? 'Email is already registered'
          : 'Employee ID is already registered in this department';
        return res.status(400).json({ success: false, message: msg });
      }
      throw err;
    }
    await session.endSession();

    // Strip password from API response
    const safeUser = user.toObject ? user.toObject() : { ...user };
    delete safeUser.password;

    // Respond after transaction commit — outbox write is durable
    res.status(201).json({
      success: true,
      message: 'User created successfully.',
      user: safeUser,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user details
// @route   PUT /api/users/:id
// @access  Private/Admin or HOD
const updateUser = async (req, res, next) => {
  try {
    const { name, email, role, employeeId, designation, department, leaveBalance } = req.body;
    let user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // If HOD updates leaveBalance, only HOD of the department or Admin can update it
    // Also guard against users with no department (null check prevents TypeError crash)
    if (req.user.role === 'HOD') {
      if (!user.department || user.department.toString() !== req.user.department._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized to modify details of faculty outside your department' });
      }
    }

    const previousRole = user.role;
    const previousDeptId = user.department ? user.department.toString() : null;

    // Handle updates depending on role
    if (req.user.role === 'Admin') {
      user.name = name || user.name;
      user.email = email || user.email;
      user.employeeId = employeeId || user.employeeId;
      user.designation = designation || user.designation;
      user.role = role || user.role;
      user.department = role === 'Admin' ? null : (department || user.department);
    }

    if (leaveBalance) {
      user.leaveBalance = {
        casual: leaveBalance.casual !== undefined ? safeFloat(leaveBalance.casual, user.leaveBalance.casual) : user.leaveBalance.casual,
        restricted: leaveBalance.restricted !== undefined ? safeInt(leaveBalance.restricted, user.leaveBalance.restricted) : user.leaveBalance.restricted,
        earned: leaveBalance.earned !== undefined ? safeInt(leaveBalance.earned, user.leaveBalance.earned) : user.leaveBalance.earned,
        vacation: (role || user.role) === 'HOD' ? 0 : (leaveBalance.vacation !== undefined ? safeInt(leaveBalance.vacation, user.leaveBalance.vacation) : user.leaveBalance.vacation),
      };
    }

    if (req.body.earnedLeaveEnabled !== undefined) {
      user.earnedLeaveEnabled = Boolean(req.body.earnedLeaveEnabled);
    }
    if (req.body.restrictedLeaveEnabled !== undefined) {
      user.restrictedLeaveEnabled = Boolean(req.body.restrictedLeaveEnabled);
    }
    if (req.body.vacationLeaveEnabled !== undefined) {
      user.vacationLeaveEnabled = Boolean(req.body.vacationLeaveEnabled);
    }
    if (req.body.oodLeaveEnabled !== undefined) {
      user.oodLeaveEnabled = Boolean(req.body.oodLeaveEnabled);
    }

    const updatedUser = await user.save();

    // Admin-only department list reconciliation
    if (req.user.role === 'Admin') {
      const newDeptId = updatedUser.department ? updatedUser.department.toString() : null;

      // 1. If department changed
      if (previousDeptId !== newDeptId) {
        // Remove from old department
        if (previousDeptId) {
          const oldDept = await Department.findById(previousDeptId);
          if (oldDept) {
            oldDept.facultyList.pull(updatedUser._id);
            if (oldDept.hod && oldDept.hod.toString() === updatedUser._id.toString()) {
              oldDept.hod = null;
            }
            await oldDept.save();
          }
        }

        // Add to new department
        if (newDeptId) {
          const newDept = await Department.findById(newDeptId);
          if (newDept) {
            newDept.facultyList.addToSet(updatedUser._id);
            if (updatedUser.role === 'HOD') {
              if (newDept.hod && newDept.hod.toString() !== updatedUser._id.toString()) {
                await User.findByIdAndUpdate(newDept.hod, { role: 'Faculty' });
              }
              newDept.hod = updatedUser._id;
            }
            await newDept.save();
          }
        }
      } 
      // 2. Department is same, but role changed
      else if (newDeptId && previousRole !== updatedUser.role) {
        const dept = await Department.findById(newDeptId);
        if (dept) {
          if (updatedUser.role === 'HOD') {
            if (dept.hod && dept.hod.toString() !== updatedUser._id.toString()) {
              await User.findByIdAndUpdate(dept.hod, { role: 'Faculty' });
            }
            dept.hod = updatedUser._id;
          } else if (previousRole === 'HOD') {
            if (dept.hod && dept.hod.toString() === updatedUser._id.toString()) {
              dept.hod = null;
            }
          }
          await dept.save();
        }
      }
    }

    res.status(200).json({ success: true, user: updatedUser });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
    }


    const deptId = user.department;

    // Note: We intentionally do NOT delete associated leave requests. 
    // Leave history must be retained for record-keeping and audit purposes.
    // The frontend UI safely handles null facultyId references via optional chaining.
    await User.findByIdAndDelete(req.params.id);

    // Remove user references in Department
    if (deptId) {
      const dept = await Department.findById(deptId);
      if (dept) {
        dept.facultyList.pull(user._id);
        if (dept.hod && dept.hod.toString() === user._id.toString()) {
          dept.hod = null;
        }
        await dept.save();
      }
    }

    res.status(200).json({ success: true, message: 'User and all associated leave records deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Update current user profile
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.name = req.body.name || user.name;
    user.designation = req.body.designation || user.designation;
    user.avatar = req.body.avatar || user.avatar;

    // Optional password update
    if (req.body.password) {
      user.password = req.body.password;
    }

    const updatedUser = await user.save();
    
    // Populate department info for the return object
    const finalUser = await User.findById(updatedUser._id).populate('department');

    res.status(200).json({
      success: true,
      user: finalUser,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  updateUserProfile,
};

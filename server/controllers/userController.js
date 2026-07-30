const User = require('../models/User');
const Department = require('../models/Department');
const { sendAccountCreatedEmail } = require('../services/emailService');

// Generate random password helper
const generateRandomPassword = (length = 8) => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

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
      .sort({ createdAt: -1 });

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
    const user = await User.findById(req.params.id).populate('department');

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

    // Check if email or employeeId already exists
    const emailExists = await User.findOne({ email });
    if (emailExists) {
      return res.status(400).json({ success: false, message: 'Email is already registered' });
    }

    const empIdExists = await User.findOne({ employeeId });
    if (empIdExists) {
      return res.status(400).json({ success: false, message: 'Employee ID is already registered' });
    }

    // Generate or use custom password
    const rawPassword = req.body.password || generateRandomPassword();

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
        casual: leaveBalance.casual !== undefined ? parseInt(leaveBalance.casual) : 12,
        sick: leaveBalance.sick !== undefined ? parseInt(leaveBalance.sick) : 10,
        earned: leaveBalance.earned !== undefined ? parseInt(leaveBalance.earned) : 15,
      };
    }

    const user = await User.create(userData);

    // Update Department relationships if department exists and not admin
    if (userData.department) {
      const dept = await Department.findById(userData.department);
      if (dept) {
        // Add to faculty list
        dept.facultyList.addToSet(user._id);

        // If the new user is an HOD, assign them as HOD of the department
        if (role === 'HOD') {
          // If department already has HOD, demote old HOD's role to Faculty
          if (dept.hod && dept.hod.toString() !== user._id.toString()) {
            await User.findByIdAndUpdate(dept.hod, { role: 'Faculty' });
          }
          dept.hod = user._id;
        }

        await dept.save();
      }
    }

    // Send email notification
    try {
      await sendAccountCreatedEmail(user, rawPassword);
    } catch (err) {
      console.error('Welcome email error:', err.message);
    }

    res.status(201).json({
      success: true,
      message: `User created successfully and password emailed. Default password is ${rawPassword}`,
      user,
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
    if (req.user.role === 'HOD' && user.department.toString() !== req.user.department._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to modify details of faculty outside your department' });
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
        casual: leaveBalance.casual !== undefined ? parseInt(leaveBalance.casual) : user.leaveBalance.casual,
        sick: leaveBalance.sick !== undefined ? parseInt(leaveBalance.sick) : user.leaveBalance.sick,
        earned: leaveBalance.earned !== undefined ? parseInt(leaveBalance.earned) : user.leaveBalance.earned,
      };
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

    const deptId = user.department;

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

    res.status(200).json({ success: true, message: 'User deleted successfully' });
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

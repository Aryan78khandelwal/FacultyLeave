const Department = require('../models/Department');
const User = require('../models/User');

// @desc    Get all departments
// @route   GET /api/departments
// @access  Private
const getDepartments = async (req, res, next) => {
  try {
    const departments = await Department.find()
      .populate('hod', 'name email employeeId designation avatar')
      .populate('facultyList', 'name email employeeId designation role leaveBalance earnedLeaveEnabled avatar');

    res.status(200).json({ success: true, count: departments.length, departments });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single department
// @route   GET /api/departments/:id
// @access  Private
const getDepartmentById = async (req, res, next) => {
  try {
    const department = await Department.findById(req.params.id)
      .populate('hod', 'name email employeeId designation avatar')
      .populate('facultyList', 'name email employeeId designation role leaveBalance earnedLeaveEnabled avatar');

    if (!department) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }

    res.status(200).json({ success: true, department });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new department
// @route   POST /api/departments
// @access  Private/Admin
const createDepartment = async (req, res, next) => {
  try {
    const { name } = req.body;

    const exists = await Department.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (exists) {
      return res.status(400).json({ success: false, message: 'Department already exists' });
    }

    const department = await Department.create({ name });

    res.status(201).json({ success: true, department });
  } catch (error) {
    next(error);
  }
};

// @desc    Update department (name or HOD assignment)
// @route   PUT /api/departments/:id
// @access  Private/Admin
const updateDepartment = async (req, res, next) => {
  try {
    const { name, hodId } = req.body;
    let department = await Department.findById(req.params.id);

    if (!department) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }

    if (name) {
      department.name = name;
    }

    // If HOD assignment is requested
    if (hodId !== undefined) {
      const oldHodId = department.hod ? department.hod.toString() : null;

      if (hodId === null) {
        // Demote old HOD
        if (oldHodId) {
          await User.findByIdAndUpdate(oldHodId, { role: 'Faculty' });
        }
        department.hod = null;
      } else {
        const user = await User.findById(hodId);
        if (!user) {
          return res.status(404).json({ success: false, message: 'Assigned HOD user not found' });
        }

        // Change user role to HOD
        user.role = 'HOD';
        user.department = department._id;
        await user.save();

        // Add HOD user to department's faculty list if not already there
        department.facultyList.addToSet(user._id);

        // Demote old HOD if different
        if (oldHodId && oldHodId !== user._id.toString()) {
          await User.findByIdAndUpdate(oldHodId, { role: 'Faculty' });
        }

        department.hod = user._id;
      }
    }

    const updatedDept = await department.save();
    
    // Fetch and populate for final response
    const finalDept = await Department.findById(updatedDept._id)
      .populate('hod', 'name email employeeId designation avatar')
      .populate('facultyList', 'name email employeeId designation role leaveBalance earnedLeaveEnabled avatar');

    res.status(200).json({ success: true, department: finalDept });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete department
// @route   DELETE /api/departments/:id
// @access  Private/Admin
const deleteDepartment = async (req, res, next) => {
  try {
    const department = await Department.findById(req.params.id);

    if (!department) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }

    // Set department to null on all associated users
    await User.updateMany({ department: department._id }, { department: null, role: 'Faculty' });

    await Department.findByIdAndDelete(req.params.id);

    res.status(200).json({ success: true, message: 'Department deleted successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDepartments,
  getDepartmentById,
  createDepartment,
  updateDepartment,
  deleteDepartment,
};

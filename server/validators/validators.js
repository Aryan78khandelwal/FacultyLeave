const { check, validationResult } = require('express-validator');

// Error checker middleware
const validateResult = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

const loginValidator = [
  check('email', 'Please include a valid email').isEmail().normalizeEmail(),
  check('password', 'Password is required').exists(),
  validateResult,
];

const createUserValidator = [
  check('name', 'Name is required').notEmpty().trim(),
  check('email', 'Please include a valid email').isEmail().normalizeEmail(),
  check('role', 'Role must be Faculty, HOD, or Admin').isIn(['Faculty', 'HOD', 'Admin']),
  check('employeeId', 'Employee ID is required').notEmpty().trim(),
  check('designation', 'Designation is required').notEmpty().trim(),
  check('department', 'Department is required for HOD and Faculty roles')
    .custom((val, { req }) => {
      if (req.body.role !== 'Admin' && !val) {
        throw new Error('Department is required for this role');
      }
      return true;
    }),
  validateResult,
];

const applyLeaveValidator = [
  check('leaveType', 'Leave type must be casual, sick, or earned').isIn(['casual', 'sick', 'earned']),
  check('startDate', 'Start Date must be a valid date').isISO8601(),
  check('endDate', 'End Date must be a valid date').isISO8601(),
  check('reason', 'Reason is required and should be at least 5 characters long').isLength({ min: 5 }).trim(),
  validateResult,
];

const updateProfileValidator = [
  check('name', 'Name cannot be empty if provided').optional().notEmpty().trim(),
  check('designation', 'Designation cannot be empty if provided').optional().notEmpty().trim(),
  validateResult,
];

module.exports = {
  loginValidator,
  createUserValidator,
  applyLeaveValidator,
  updateProfileValidator,
};

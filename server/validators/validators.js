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
  check('email', 'Please include a valid email').isEmail().toLowerCase(),
  check('role', 'Role must be Faculty, HOD, Admin, Instructor, or SDA').isIn(['Faculty', 'HOD', 'Admin', 'Instructor', 'SDA']),
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
  check('leaveType', 'Leave type must be casual, restricted, earned, vacation, or ood').isIn(['casual', 'restricted', 'earned', 'vacation', 'ood']),
  check('startDate', 'Start Date must be a valid date').isISO8601(),
  check('endDate', 'End Date must be a valid date').isISO8601(),
  check('reason', 'Reason is required and should be at least 5 characters long').isLength({ min: 5 }).trim(),

  // Half-day validation rules
  check('duration')
    .optional()
    .isIn(['FULL_DAY', 'HALF_DAY'])
    .withMessage('Duration must be FULL_DAY or HALF_DAY'),

  check('halfDayType')
    .custom((value, { req }) => {
      const duration = req.body.duration || 'FULL_DAY';
      if (duration === 'HALF_DAY') {
        if (!value) throw new Error('halfDayType is required for half-day leave');
        if (!['FIRST_HALF', 'SECOND_HALF'].includes(value)) {
          throw new Error('halfDayType must be FIRST_HALF or SECOND_HALF');
        }
      }
      if (duration === 'FULL_DAY' && value) {
        throw new Error('halfDayType must not be provided for full-day leave');
      }
      return true;
    }),

  check('leaveType')
    .custom((value, { req }) => {
      const duration = req.body.duration || 'FULL_DAY';
      if (duration === 'HALF_DAY' && !['casual', 'earned'].includes(value)) {
        throw new Error('Half-day leave is only allowed for Casual Leave (CL) and Earned Leave (EL)');
      }
      return true;
    }),

  check('startDate')
    .custom((value, { req }) => {
      const duration = req.body.duration || 'FULL_DAY';
      if (duration === 'HALF_DAY') {
        const start = new Date(value);
        const end = new Date(req.body.endDate);
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        if (start.getTime() !== end.getTime()) {
          throw new Error('Half-day leave must have the same start and end date (single day only)');
        }
      }
      return true;
    }),

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

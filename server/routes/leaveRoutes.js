const express = require('express');
const {
  applyLeave,
  getLeaves,
  getLeaveById,
  reviewLeave,
  getLeaveAnalytics,
  getCalendarLeaves,
  uploadCertificate,
} = require('../controllers/leaveController');
const { protect, authorize } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { applyLeaveValidator } = require('../validators/validators');

const router = express.Router();

router.get('/calendar', protect, getCalendarLeaves);
router.get('/analytics', protect, getLeaveAnalytics);

router.route('/')
  .get(protect, getLeaves)
  .post(
    protect,
    authorize('Faculty', 'HOD', 'Instructor', 'SDA'),
    upload.single('document'),
    // Parse JSON form fields if they are sent in multi-part form
    (req, res, next) => {
      // In case fields are sent as string in form-data, let's clean them up
      next();
    },
    applyLeaveValidator,
    applyLeave
  );

router.route('/:id')
  .get(protect, getLeaveById);

router.route('/:id/review')
  .put(protect, authorize('HOD', 'Admin'), reviewLeave);

router.route('/:id/certificate')
  .put(protect, authorize('Faculty', 'Instructor', 'SDA'), upload.single('document'), uploadCertificate);

module.exports = router;

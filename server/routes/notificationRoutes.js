const express = require('express');
const {
  getNotifications,
  replayFailedNotification,
} = require('../controllers/notificationController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// All notification management operations require Admin privileges
router.use(protect);
router.use(authorize('Admin'));

router.get('/', getNotifications);
router.post('/:id/replay', replayFailedNotification);

module.exports = router;


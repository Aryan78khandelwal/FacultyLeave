const Notification = require('../models/Notification');
const { replayNotification, getQueueMetrics } = require('../services/notificationWorker');

// @desc    Get notifications with pagination, filters, and queue metrics
// @route   GET /api/notifications
// @access  Private/Admin
const getNotifications = async (req, res, next) => {
  try {
    const { status, type, page = 1, limit = 20 } = req.query;
    const query = {};

    if (status) query.status = status;
    if (type) query.type = type;

    const parsedLimit = parseInt(limit, 10) || 20;
    const skipIndex = (Math.max(1, parseInt(page, 10)) - 1) * parsedLimit;

    const [total, notifications, metrics] = await Promise.all([
      Notification.countDocuments(query),
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skipIndex)
        .limit(parsedLimit)
        .lean(),
      getQueueMetrics(),
    ]);

    res.status(200).json({
      success: true,
      metrics,
      total,
      currentPage: parseInt(page, 10) || 1,
      totalPages: Math.ceil(total / parsedLimit),
      notifications,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Replay a failed notification
// @route   POST /api/notifications/:id/replay
// @access  Private/Admin
const replayFailedNotification = async (req, res, next) => {
  try {
    const force = Boolean(req.body && req.body.force);
    const notification = await replayNotification(req.params.id, req.user, { force });
    res.status(200).json({
      success: true,
      message: `Notification ${notification._id} (${notification.type}) queued for replay`,
      notification,
    });
  } catch (error) {
    // 400 for business logic rejection (e.g. not failed or redacted)
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  getNotifications,
  replayFailedNotification,
};


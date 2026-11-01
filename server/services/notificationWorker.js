const crypto = require('crypto');
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const User = require('../models/User');
const {
  sendLeaveAppliedEmail,
  sendLeaveApprovedEmail,
  sendLeaveRejectedEmail,
  sendLeaveTemporarilyApprovedEmail,
  sendAccountCreatedEmail,
  sendResetPasswordEmail,
} = require('./emailService');
const { MAX_ATTEMPTS, BACKOFF_MS, registerProcessTrigger } = require('../utils/enqueueNotification');
const { encryptSensitive, decryptSensitive } = require('../utils/cryptoHelper');

const POLL_INTERVAL_MS = 30_000; // poll every 30 seconds
const MAX_LOOP_MS = 60_000;      // max time budget per processing cycle (1 minute)
const CLAIM_LEASE_MS = 120_000;  // 2-minute claim lease to prevent stranded processing tasks
let isProcessing = false;

/**
 * Calculate metrics for queue monitoring (backlog count, age of oldest pending item).
 */
const getQueueMetrics = async () => {
  try {
    const [pendingCount, oldestPending, failedCount, processingCount] = await Promise.all([
      Notification.countDocuments({ status: 'pending' }),
      Notification.findOne({ status: 'pending' }).sort({ createdAt: 1 }).select('createdAt').lean(),
      Notification.countDocuments({ status: 'failed' }),
      Notification.countDocuments({ status: 'processing' }),
    ]);
    const oldestAgeSec = oldestPending
      ? Math.floor((Date.now() - new Date(oldestPending.createdAt).getTime()) / 1000)
      : 0;
    return { pendingCount, failedCount, processingCount, oldestAgeSec };
  } catch (err) {
    console.error('[worker] Error calculating queue metrics:', err.message);
    return { pendingCount: 0, failedCount: 0, processingCount: 0, oldestAgeSec: 0 };
  }
};

/**
 * Reclaim any processing notifications whose claim lease has expired.
 * Reclaims ONLY records where lockExpiresAt <= now (or missing).
 * Safe in multi-replica deployments: work currently held by another active replica
 * (with an unexpired future lockExpiresAt) will NEVER be reclaimed.
 */
const reclaimStrandedProcessingRecords = async (reason = 'lease_check') => {
  try {
    const now = new Date();
    const result = await Notification.updateMany(
      {
        status: 'processing',
        $or: [
          { lockExpiresAt: { $lte: now } },
          { lockExpiresAt: null },
          { lockExpiresAt: { $exists: false } },
        ],
      },
      {
        $set: {
          status: 'pending',
          nextAttemptAt: now,
        },
        $unset: { lockedAt: 1, lockExpiresAt: 1 },
        $push: {
          auditLog: {
            action: 'LEASE_RECLAIMED',
            performedBy: `worker-${reason}`,
            timestamp: now,
            details: `Reclaimed expired processing lease (${reason})`,
          },
        },
      }
    );

    if (result.modifiedCount > 0) {
      console.warn(
        `[worker] Reclaimed ${result.modifiedCount} processing notification(s) with expired leases (${reason}).`
      );
    }

    // On startup, also backfill any legacy records that lack a persistent idempotencyKey
    // to ensure they have an immutable UUID persisted prior to any dispatch
    if (reason === 'startup') {
      const missingKeys = await Notification.find({
        $or: [
          { idempotencyKey: null },
          { idempotencyKey: { $exists: false } },
          { idempotencyKey: '' },
        ],
      }).limit(500);

      for (const record of missingKeys) {
        await Notification.updateOne(
          { _id: record._id },
          { $set: { idempotencyKey: crypto.randomUUID() } }
        );
      }
      if (missingKeys.length > 0) {
        console.log(
          `[worker] Backfilled persistent idempotency keys for ${missingKeys.length} legacy notification(s).`
        );
      }

      // Sanitize any pending/processing legacy account-created notifications so they cannot retain or send passwords
      const legacyAccountNotifications = await Notification.updateMany(
        {
          type: 'account-created',
          status: { $in: ['pending', 'processing'] },
          $or: [
            { 'payload.encryptedPassword': { $exists: true } },
            { 'payload.rawPassword': { $exists: true } },
          ],
        },
        {
          $unset: {
            'payload.encryptedPassword': 1,
            'payload.rawPassword': 1,
          },
        }
      );
      if (legacyAccountNotifications.modifiedCount > 0) {
        console.log(
          `[worker] Sanitized ${legacyAccountNotifications.modifiedCount} legacy account-created notification(s). Passwords stripped.`
        );
      }
    }
  } catch (err) {
    console.error('[worker] Error reclaiming stranded processing records:', err.message);
  }
};

/**
 * Dispatch a single notification to the correct email function.
 * Throws on failure so the caller can apply retry logic.
 */
const dispatch = async (notification) => {
  const { type, payload } = notification;

  // Guarantee that the notification has a persistent idempotencyKey in MongoDB BEFORE sending.
  // Note: Mongoose schema defaults can populate an in-memory key on hydration for older records,
  // but if the field is missing in the database document, a crash between send and save will
  // cause the next retry to hydrate with a different key, bypassing provider deduplication.
  // This atomic write ensures the key is durably persisted in the DB prior to network dispatch.
  const keyToPersist = notification.idempotencyKey || crypto.randomUUID();
  await Notification.updateOne(
    {
      _id: notification._id,
      $or: [{ idempotencyKey: null }, { idempotencyKey: { $exists: false } }],
    },
    { $set: { idempotencyKey: keyToPersist } }
  );

  const persistedKeyDoc = await Notification.findById(notification._id).select('idempotencyKey').lean();
  const idempotencyKey = persistedKeyDoc?.idempotencyKey || keyToPersist;
  notification.idempotencyKey = idempotencyKey;

  const sendOpts = { idempotencyKey };

  switch (type) {
    case 'leave-applied':
      await sendLeaveAppliedEmail(
        payload.hodEmail,
        payload.hodName,
        payload.facultyName,
        payload.leaveRequest,
        sendOpts
      );
      break;

    case 'leave-approved':
      await sendLeaveApprovedEmail(
        payload.facultyEmail,
        payload.facultyName,
        payload.leaveRequest,
        payload.reviewerName,
        sendOpts
      );
      break;

    case 'leave-rejected':
      await sendLeaveRejectedEmail(
        payload.facultyEmail,
        payload.facultyName,
        payload.leaveRequest,
        payload.reviewerName,
        sendOpts
      );
      break;

    case 'leave-temporarily-approved':
      await sendLeaveTemporarilyApprovedEmail(
        payload.facultyEmail,
        payload.facultyName,
        payload.leaveRequest,
        payload.reviewerName,
        sendOpts
      );
      break;

    case 'account-created': {
      // Send welcome email containing only non-sensitive account information and login link
      // Passwords are never decrypted, logged, or sent in notifications
      await sendAccountCreatedEmail(payload.user, sendOpts);
      break;
    }

    case 'password-reset': {
      let resetUrl = payload.resetUrl;

      // Ensure reset links are still valid when sent:
      // If the email was delayed by worker retries or queue backpressure,
      // refresh the token on the user document so the recipient receives a valid 10-minute link.
      if (payload.userId) {
        const user = await User.findById(payload.userId);
        if (!user) {
          throw new Error('User account not found for password reset notification');
        }

        const now = Date.now();
        const isExpiringSoon = !user.resetPasswordExpire || (new Date(user.resetPasswordExpire).getTime() <= now + 60_000);

        if (isExpiringSoon) {
          // Token expired or about to expire: generate a fresh token
          const freshToken = crypto.randomBytes(20).toString('hex');
          user.resetPasswordToken = crypto.createHash('sha256').update(freshToken).digest('hex');
          user.resetPasswordExpire = new Date(now + 10 * 60 * 1000);

          notification.payload.encryptedResetToken = encryptSensitive(freshToken);
          notification.payload.expiresAt = user.resetPasswordExpire;
          notification.markModified('payload');

          // Save both user and notification atomically inside a single MongoDB transaction
          // to eliminate any crash window where user has the new token but outbox retains the old
          const session = await mongoose.startSession();
          try {
            await session.withTransaction(async () => {
              await user.save({ validateBeforeSave: false, session });
              await notification.save({ session });
            });
          } finally {
            await session.endSession();
          }

          resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password/${freshToken}`;
          console.log(`[worker] Atomically refreshed reset token and updated notification payload for ${payload.userEmail}`);
        } else if (payload.encryptedResetToken) {
          const decryptedToken = decryptSensitive(payload.encryptedResetToken);
          if (!decryptedToken) {
            throw new Error('Failed to decrypt password reset token');
          }
          resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password/${decryptedToken}`;
        }
      }

      if (!resetUrl) {
        throw new Error('No valid reset URL available to send password-reset email');
      }

      await sendResetPasswordEmail(payload.userEmail, payload.userName, resetUrl, sendOpts);
      break;
    }

    default:
      console.warn(`[worker] Unknown notification type: ${type} — marking failed`);
      throw new Error(`Unknown notification type: ${type}`);
  }
};

/**
 * Classify an email-send error as permanent or transient.
 * HTTP 4xx (except 408 Request Timeout and 429 Too Many Requests) are permanent.
 * Everything else (408, 429, 5xx, network errors, timeouts) is transient and should retry.
 */
const isPermanentError = (err) => {
  const msg = err.message || '';
  const match = msg.match(/Brevo API error (\d+)/);
  if (match) {
    const code = parseInt(match[1], 10);
    // 408 Request Timeout and 429 Too Many Requests are transient — should retry
    if (code === 408 || code === 429) return false;
    // Other 4xx = bad request / unauthorized / not found → permanent
    if (code >= 400 && code < 500) return true;
  }
  // Configuration or payload errors that cannot self-heal
  if (msg.includes('BREVO_API_KEY not configured')) return true;
  if (msg.includes('Unknown notification type')) return true;
  if (msg.includes('User account not found')) return true;
  if (msg.includes('No password available')) return true;
  if (msg.includes('No valid reset URL')) return true;

  // Everything else (5xx, timeout, network error) → transient
  return false;
};

/**
 * Redact sensitive credential fields from notification payload.
 */
const redactSensitivePayload = (notification) => {
  if (notification.type === 'account-created' || notification.type === 'password-reset') {
    notification.payload = { redacted: true, type: notification.type };
  }
};

/**
 * One processing cycle: atomically claim and process notifications one at a time
 * until the queue is empty or the time budget is exceeded.
 *
 * Claim Lease Mechanism:
 * Claims pending records OR processing records whose 2-minute lease has expired
 * (protecting against tasks being permanently stranded by worker process crashes).
 */
const processNotifications = async () => {
  if (isProcessing) return;
  isProcessing = true;

  const startTime = Date.now();
  let hitTimeBudget = false;

  try {
    // Loop: claim one notification at a time until queue is empty or time budget exceeded
    while (Date.now() - startTime < MAX_LOOP_MS) {
      const now = new Date();
      const leaseExpiry = new Date(Date.now() + CLAIM_LEASE_MS);

      // Atomically claim a pending record OR an expired-lease processing record
      const notification = await Notification.findOneAndUpdate(
        {
          $or: [
            { status: 'pending', nextAttemptAt: { $lte: now } },
            { status: 'processing', lockExpiresAt: { $lte: now } },
          ],
        },
        {
          $set: {
            status: 'processing',
            lockedAt: now,
            lockExpiresAt: leaseExpiry,
          },
        },
        { sort: { nextAttemptAt: 1 }, new: true }
      );

      if (!notification) break; // Queue is empty

      try {
        await dispatch(notification);
        notification.status = 'sent';
        notification.lastError = '';
        notification.lockedAt = undefined;
        notification.lockExpiresAt = undefined;

        // Redact credentials on successful delivery
        redactSensitivePayload(notification);
        await notification.save();

        console.log(`[worker] Notification sent: ${notification.type} (${notification._id})`);
      } catch (err) {
        notification.attempts += 1;
        notification.lastError = err.message;
        notification.lockedAt = undefined;
        notification.lockExpiresAt = undefined;

        if (isPermanentError(err) || notification.attempts >= MAX_ATTEMPTS) {
          notification.status = 'failed';

          // Also redact sensitive credentials on permanent failure
          redactSensitivePayload(notification);

          console.error(
            `[worker] Notification permanently failed after ${notification.attempts} attempts: ` +
            `${notification.type} (${notification._id}) — ${err.message}`
          );
        } else {
          // Schedule next retry with exponential back-off + jitter
          const baseDelay = BACKOFF_MS[notification.attempts - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
          const jitter = Math.floor(Math.random() * baseDelay * 0.2); // ±20% jitter
          notification.status = 'pending'; // release back to pending for retry
          notification.nextAttemptAt = new Date(Date.now() + baseDelay + jitter);
          console.warn(
            `[worker] Notification attempt ${notification.attempts}/${MAX_ATTEMPTS} failed: ` +
            `${notification.type} (${notification._id}) — retrying at ${notification.nextAttemptAt.toISOString()} — ${err.message}`
          );
        }

        await notification.save();
      }
    }

    if (Date.now() - startTime >= MAX_LOOP_MS) {
      hitTimeBudget = true;
      const metrics = await getQueueMetrics();
      console.warn(
        `[worker] Time budget reached (${MAX_LOOP_MS / 1000}s). ` +
        `Remaining queue: ${metrics.pendingCount} pending (oldest: ${metrics.oldestAgeSec}s), ` +
        `${metrics.failedCount} failed, ${metrics.processingCount} in-flight. Scheduling immediate continuation.`
      );
    }
  } finally {
    isProcessing = false;
  }

  // If time budget was reached while more items might be waiting,
  // schedule immediate continuation instead of waiting for next poll cycle
  if (hitTimeBudget) {
    setImmediate(() => {
      processNotifications().catch((err) => {
        console.error('[worker] Continuation error:', err.message);
      });
    });
  }
};

// Register worker processor so newly enqueued notifications trigger immediate delivery
registerProcessTrigger(processNotifications);

let workerTimer = null;

/** Start the polling worker. Safe to call multiple times (no-op if already running). */
const startWorker = () => {
  if (workerTimer) return;

  // On worker startup, immediately reclaim any stranded processing records left by previous crashes
  reclaimStrandedProcessingRecords('startup').catch((err) => {
    console.error('[worker] Startup reclaim error:', err.message);
  });

  workerTimer = setInterval(async () => {
    try {
      await processNotifications();
    } catch (err) {
      console.error('[worker] Unexpected worker error:', err.message);
    }
  }, POLL_INTERVAL_MS);
  console.log(`📬 Notification worker started — polling every ${POLL_INTERVAL_MS / 1000}s`);
};

/** Stop the worker gracefully (e.g. during shutdown). */
const stopWorker = () => {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
    console.log('[worker] Notification worker stopped');
  }
};

/**
 * Replay a failed notification (audited and monitored operator recovery path).
 *
 * @param {string} notificationId - ID of the failed notification
 * @param {object} operator - Information about the administrator requesting replay
 * @returns {Promise<object>} - The updated notification document
 */
const replayNotification = async (
  notificationId,
  operator = { name: 'Admin', role: 'Admin' },
  opts = {}
) => {
  const notification = await Notification.findById(notificationId);
  if (!notification) {
    throw new Error('Notification not found');
  }

  if (notification.status !== 'failed') {
    throw new Error(`Only failed notifications can be replayed (current status: ${notification.status})`);
  }

  // Redacted credential payloads cannot be blindly re-sent because the secret was stripped for security
  if (notification.payload && notification.payload.redacted) {
    throw new Error(
      `Cannot replay '${notification.type}': sensitive credentials were automatically redacted on failure for security. ` +
      `Please trigger a new account invite or password reset request instead.`
    );
  }

  // Enforce the 30-minute provider idempotency safety threshold.
  // Replaying after 30 minutes risks delivering a duplicate email if Brevo already
  // sent it during an earlier attempt (Brevo's idempotency key cache TTL is 30m).
  // Operators must explicitly supply { force: true } to confirm and override this safety barrier.
  const IDEMPOTENCY_WINDOW_MS = 30 * 60 * 1000;
  const ageMs = Date.now() - new Date(notification.createdAt).getTime();
  const isPastIdempotencyWindow = ageMs > IDEMPOTENCY_WINDOW_MS;

  if (isPastIdempotencyWindow && !opts.force) {
    const ageMins = Math.floor(ageMs / 60000);
    throw new Error(
      `Cannot replay notification ${notification._id}: it was created ${ageMins} minutes ago, which exceeds Brevo's 30-minute idempotency window. Replaying risks delivering a duplicate email. To confirm and replay anyway, pass { force: true }.`
    );
  }

  // Ensure the replayed notification has a persistent idempotencyKey
  if (!notification.idempotencyKey) {
    notification.idempotencyKey = crypto.randomUUID();
  }

  notification.status = 'pending';
  notification.attempts = 0;
  notification.nextAttemptAt = new Date();
  notification.lastError = '';
  notification.lockedAt = undefined;
  notification.lockExpiresAt = undefined;
  notification.replayedAt = new Date();
  notification.replayedBy = {
    id: operator._id || operator.id,
    name: operator.name || 'Admin',
    email: operator.email || '',
  };
  notification.replayCount = (notification.replayCount || 0) + 1;

  if (!Array.isArray(notification.auditLog)) {
    notification.auditLog = [];
  }

  const auditDetails = isPastIdempotencyWindow
    ? `Manual operator FORCED replay attempt #${notification.replayCount} past 30m provider idempotency window (age: ${Math.floor(ageMs / 60000)}m; confirmed duplicate risk)`
    : `Manual operator replay attempt #${notification.replayCount} (within provider idempotency window)`;

  notification.auditLog.push({
    action: isPastIdempotencyWindow ? 'REPLAY_REQUESTED_FORCED' : 'REPLAY_REQUESTED',
    performedBy: `${operator.name || 'Admin'} (${operator.email || operator.role || 'Admin'})`,
    timestamp: new Date(),
    details: auditDetails,
  });

  await notification.save();
  console.log(`[worker] Notification ${notification._id} (${notification.type}) queued for replay by ${operator.name}`);

  // Wake up worker immediately to process replayed item
  setImmediate(() => {
    processNotifications().catch((err) => {
      console.error('[worker] Immediate replay process error:', err.message);
    });
  });

  return notification;
};

module.exports = {
  startWorker,
  stopWorker,
  processNotifications,
  replayNotification,
  getQueueMetrics,
  reclaimStrandedProcessingRecords,
};

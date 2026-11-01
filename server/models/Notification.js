const crypto = require('crypto');
const mongoose = require('mongoose');

/**
 * Outbox model — persists every email notification as a durable task.
 * The notification worker polls this collection, sends emails, and retries
 * transient failures with exponential back-off before marking permanent failures.
 *
 * Idempotency & Delivery Guarantee:
 * - Each notification carries a unique UUID `idempotencyKey` sent to Brevo in the payload headers.
 * - If a crash occurs after the email is sent but before MongoDB marks 'sent', retries pass
 *   the same key. Brevo rejects the duplicate (`duplicate_parameter`) and the worker records success.
 * - Claim leases (`lockExpiresAt`) prevent tasks from remaining stranded if a worker process crashes.
 */
const notificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: [
        'leave-applied',
        'leave-approved',
        'leave-rejected',
        'leave-temporarily-approved',
        'account-created',
        'password-reset',
      ],
    },
    // All data required to build and send the email — serialised at enqueue time
    // so the worker never needs to re-query the database.
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ['pending', 'processing', 'sent', 'failed'],
      default: 'pending',
    },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: '' },
    // Worker skips notifications whose nextAttemptAt is in the future (back-off)
    nextAttemptAt: { type: Date, default: Date.now },

    // Provider-level idempotency key (UUID v4)
    idempotencyKey: {
      type: String,
      default: () => crypto.randomUUID(),
      index: true,
    },

    // Lease tracking to prevent stranded records on worker crashes
    lockedAt: { type: Date },
    lockExpiresAt: { type: Date, index: true },

    // Audit and operator recovery tracking
    replayedAt: { type: Date },
    replayedBy: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: { type: String },
      email: { type: String },
    },
    replayCount: { type: Number, default: 0 },
    auditLog: [
      {
        action: { type: String, required: true },
        performedBy: { type: String, default: 'system' },
        timestamp: { type: Date, default: Date.now },
        details: { type: String },
      },
    ],
  },
  { timestamps: true }
);

// Indexes used by the worker's polling and claiming queries
notificationSchema.index({ status: 1, nextAttemptAt: 1, lockExpiresAt: 1 });

// Auto-delete completed/failed notifications after 7 days to prevent unbounded growth
notificationSchema.index(
  { updatedAt: 1 },
  { expireAfterSeconds: 7 * 24 * 60 * 60, partialFilterExpression: { status: { $in: ['sent', 'failed'] } } }
);

module.exports = mongoose.model('Notification', notificationSchema);

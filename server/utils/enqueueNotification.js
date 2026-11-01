const Notification = require('../models/Notification');

const MAX_ATTEMPTS = 5;

// Exponential back-off delays: 1 min → 2 min → 5 min → 10 min
// Cumulative retry span: ~18 minutes (guaranteed within Brevo's 30-minute idempotency key TTL)
const BACKOFF_MS = [60_000, 120_000, 300_000, 600_000];

let triggerProcess = null;
const registerProcessTrigger = (fn) => {
  triggerProcess = fn;
};

/**
 * Enqueue a notification into the outbox.
 *
 * When a `session` is provided the insert participates in that transaction —
 * if the transaction aborts, the notification is rolled back along with the
 * business write. Callers that pass a session MUST let errors propagate so the
 * transaction aborts on failure.
 *
 * When called WITHOUT a session (fire-and-forget after a successful business
 * write), failures are caught and logged so the caller's main workflow is not
 * interrupted.
 *
 * @param {string} type     - Notification type (must match Notification model enum)
 * @param {object} payload  - All data needed to send the email; serialised at call time
 * @param {object} [opts]   - Options: { session } for transactional inserts
 */
const enqueueNotification = async (type, payload, opts = {}) => {
  const createOpts = opts.session ? { session: opts.session } : {};

  // When inside a transaction, let errors propagate to abort the transaction.
  // When outside a transaction, catch and log so the API response is not blocked.
  if (opts.session) {
    const [doc] = await Notification.create([{ type, payload }], createOpts);
    // Wake up the worker immediately for fast delivery
    if (triggerProcess) {
      setImmediate(() => {
        triggerProcess().catch((err) => {
          console.error('[outbox] Immediate trigger error:', err.message);
        });
      });
    }
    return doc;
  }

  try {
    const doc = await Notification.create({ type, payload });
    // Wake up the worker immediately for fast delivery
    if (triggerProcess) {
      setImmediate(() => {
        triggerProcess().catch((err) => {
          console.error('[outbox] Immediate trigger error:', err.message);
        });
      });
    }
    return doc;
  } catch (err) {
    // Log but do not propagate — main request has already succeeded
    console.error(`[outbox] Failed to enqueue notification (${type}):`, err.message);
  }
};

module.exports = { enqueueNotification, registerProcessTrigger, MAX_ATTEMPTS, BACKOFF_MS };

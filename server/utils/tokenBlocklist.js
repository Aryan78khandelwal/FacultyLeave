/**
 * In-memory token blocklist.
 *
 * When a user logs out, or an admin changes a user's role/deletes them,
 * the current JWT is added here. The authMiddleware checks this list on
 * every request so stale tokens are rejected immediately rather than
 * remaining valid for up to their 7-day TTL.
 *
 * NOTE: This is a single-process, in-memory store. It is reset on server
 * restart. For a multi-process or clustered deployment, migrate this to
 * Redis (ioredis) or a similar shared cache.
 */

const blocklist = new Map(); // token -> expiry timestamp (ms)

/**
 * Add a JWT to the blocklist.
 * @param {string} token  - Raw JWT string
 * @param {number} expMs  - Unix timestamp in ms when the token naturally expires
 */
const addToBlocklist = (token, expMs) => {
  blocklist.set(token, expMs);
};

/**
 * Check whether a token has been revoked.
 * Also prunes expired entries to prevent unbounded growth.
 * @param {string} token - Raw JWT string
 * @returns {boolean}
 */
// Run a cleanup task every 15 minutes to remove expired tokens
setInterval(() => {
  const now = Date.now();
  for (const [t, expMs] of blocklist.entries()) {
    if (now > expMs) blocklist.delete(t);
  }
}, 15 * 60 * 1000).unref(); // unref() so this timer doesn't prevent Node from exiting

const isBlocked = (token) => {
  return blocklist.has(token);
};

module.exports = { addToBlocklist, isBlocked };

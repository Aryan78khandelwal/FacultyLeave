const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const SystemLock = require('../models/SystemLock');

const BOOTSTRAP_LOCK_KEY = 'admin_bootstrap';
const LEASE_DURATION_MS = 60 * 1000; // 60 seconds lease
const MAX_WAIT_ATTEMPTS = 15;
const WAIT_INTERVAL_MS = 1000;

/**
 * Verify whether the active MongoDB deployment supports multi-document transactions.
 * Transactions require a replica set (hello.setName) or a sharded cluster (hello.msg === 'isdbgrid').
 *
 * @param {mongoose.Connection} connection
 * @returns {Promise<boolean>}
 */
async function verifyTransactionSupport(connection = mongoose.connection) {
  let hello;
  try {
    hello = await connection.db.command({ hello: 1 });
  } catch (err) {
    // Fallback if db.command differs by driver configuration
    try {
      hello = await connection.db.admin().command({ hello: 1 });
    } catch (adminErr) {
      throw new Error(`Failed to check MongoDB transaction capability: ${err.message}`);
    }
  }

  const isSupported = Boolean(hello && (hello.setName || hello.msg === 'isdbgrid'));
  if (!isSupported) {
    throw new Error(
      'MongoDB deployment does not support multi-document transactions. A replica set or sharded cluster is required for safe Admin bootstrap.'
    );
  }
  return true;
}

/**
 * Validate password strength without leaking the password.
 *
 * @param {string} password
 * @returns {string|null} Error message or null if valid
 */
function validatePasswordStrength(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters long.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'BOOTSTRAP_ADMIN_PASSWORD must contain at least one uppercase letter.';
  }
  if (!/[a-z]/.test(password)) {
    return 'BOOTSTRAP_ADMIN_PASSWORD must contain at least one lowercase letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'BOOTSTRAP_ADMIN_PASSWORD must contain at least one number.';
  }
  return null;
}

/**
 * Validate email format.
 *
 * @param {string} email
 * @returns {boolean}
 */
function validateEmail(email) {
  const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
  return typeof email === 'string' && emailRegex.test(email);
}

/**
 * Sleep helper for wait intervals.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Attempt to acquire the bootstrap lock atomically.
 *
 * @param {string} ownerToken
 * @param {number} leaseMs
 * @returns {Promise<{ acquired: boolean, lock?: object, completed?: boolean }>}
 */
async function tryAcquireBootstrapLock(ownerToken, leaseMs = LEASE_DURATION_MS) {
  const now = new Date();
  const lockExpiresAt = new Date(now.getTime() + leaseMs);

  try {
    const lock = await SystemLock.findOneAndUpdate(
      {
        key: BOOTSTRAP_LOCK_KEY,
        completed: false,
        $or: [
          { locked: false },
          { lockExpiresAt: { $lt: now } },
          { locked: { $exists: false } },
        ],
      },
      {
        $set: {
          locked: true,
          lockedAt: now,
          lockExpiresAt: lockExpiresAt,
          ownerToken: ownerToken,
        },
        $setOnInsert: {
          key: BOOTSTRAP_LOCK_KEY,
          completed: false,
        },
      },
      { upsert: true, new: true }
    );

    if (lock && lock.ownerToken === ownerToken) {
      return { acquired: true, lock };
    }
    return { acquired: false };
  } catch (err) {
    if (err.code === 11000) {
      // E11000 duplicate key race: another instance inserted the document simultaneously
      const existing = await SystemLock.findOne({ key: BOOTSTRAP_LOCK_KEY });
      if (existing && existing.completed) {
        return { acquired: false, completed: true };
      }
      return { acquired: false };
    }
    throw err;
  }
}

/**
 * Ensure that the unique index on SystemLock.key exists in MongoDB.
 * If the index cannot be ensured, throws a fatal error to abort startup,
 * because multi-replica mutual exclusion depends on this uniqueness constraint.
 *
 * @param {mongoose.Model} LockModel
 * @returns {Promise<boolean>}
 */
async function ensureSystemLockIndex(LockModel = SystemLock) {
  try {
    await LockModel.collection.createIndex({ key: 1 }, { unique: true });
  } catch (err) {
    // If createIndex threw, check whether an equivalent unique index already exists
    try {
      const indexes = await LockModel.collection.indexes();
      const hasUniqueKeyIndex = indexes.some(
        (idx) => idx.key && idx.key.key === 1 && idx.unique === true
      );
      if (hasUniqueKeyIndex) {
        return true;
      }
    } catch (listErr) {
      // Failed to inspect existing indexes
    }

    const fatalMsg = `Fatal: Failed to ensure unique index on SystemLock.key: ${err.message}. Cannot guarantee multi-replica mutual exclusion.`;
    console.error(`[Bootstrap] ERROR: ${fatalMsg}`);
    throw new Error(fatalMsg);
  }

  // Explicitly verify that the unique index exists in the collection's index catalog
  try {
    const indexes = await LockModel.collection.indexes();
    const hasUniqueKeyIndex = indexes.some(
      (idx) => idx.key && idx.key.key === 1 && idx.unique === true
    );
    if (!hasUniqueKeyIndex) {
      const fatalMsg =
        'Fatal: SystemLock collection does not have a unique index on "key". Cannot guarantee multi-replica mutual exclusion.';
      console.error(`[Bootstrap] ERROR: ${fatalMsg}`);
      throw new Error(fatalMsg);
    }
  } catch (err) {
    if (err.message.startsWith('Fatal:')) {
      throw err;
    }
    const fatalMsg = `Fatal: Failed to verify SystemLock indexes: ${err.message}. Cannot guarantee multi-replica mutual exclusion.`;
    console.error(`[Bootstrap] ERROR: ${fatalMsg}`);
    throw new Error(fatalMsg);
  }

  return true;
}

/**
 * Secure one-time Admin bootstrap service.
 * Multi-replica safe, transaction-backed, and strictly decoupled from default credentials.
 *
 * @returns {Promise<{ status: string, details?: string }>}
 */
async function bootstrapAdmin() {
  // Ensure the explicit unique index is created and verified on SystemLock.
  // Fails startup immediately if the index cannot be ensured, because multi-replica
  // mutual exclusion depends on uniqueness to prevent concurrent bootstrap.
  await ensureSystemLockIndex();

  // 1. Check if already marked completed in SystemLock (fast path)
  const existingLock = await SystemLock.findOne({ key: BOOTSTRAP_LOCK_KEY });
  if (existingLock && existingLock.completed) {
    console.log('[Bootstrap] Initial Admin bootstrap is marked complete. Skipping.');
    return { status: 'already_completed' };
  }

  // 2. Check if an Admin account already exists in the database
  const existingAdminCount = await User.countDocuments({ role: 'Admin' });
  if (existingAdminCount > 0) {
    // Admin already exists! Atomically mark bootstrap complete without creating or modifying any accounts.
    await SystemLock.findOneAndUpdate(
      { key: BOOTSTRAP_LOCK_KEY },
      {
        $set: {
          completed: true,
          completedAt: new Date(),
          locked: false,
          details: `Existing Admin accounts detected (${existingAdminCount} found). Marked complete.`,
        },
        $setOnInsert: {
          key: BOOTSTRAP_LOCK_KEY,
        },
      },
      { upsert: true, new: true }
    );
    console.log(
      `[Bootstrap] ${existingAdminCount} Admin account(s) already exist in database. Marked bootstrap completed without changes.`
    );
    return { status: 'already_exists', adminCount: existingAdminCount };
  }

  // 3. No Admin exists in DB: Inspect environment variables
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL ? process.env.BOOTSTRAP_ADMIN_EMAIL.trim() : '';
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
  const name = process.env.BOOTSTRAP_ADMIN_NAME ? process.env.BOOTSTRAP_ADMIN_NAME.trim() : 'System Administrator';
  const employeeId = process.env.BOOTSTRAP_ADMIN_EMPLOYEE_ID ? process.env.BOOTSTRAP_ADMIN_EMPLOYEE_ID.trim() : 'EMP-ADMIN-001';
  const designation = process.env.BOOTSTRAP_ADMIN_DESIGNATION ? process.env.BOOTSTRAP_ADMIN_DESIGNATION.trim() : 'System Administrator';

  if (!email || !password) {
    const errorMsg =
      'Initial Admin bootstrap required: No Admin account exists in the database. ' +
      'Please configure BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD in environment variables.';
    console.error(`[Bootstrap] ERROR: ${errorMsg}`);
    throw new Error(errorMsg);
  }

  // Validate email format
  if (!validateEmail(email)) {
    const errorMsg = 'Initial Admin bootstrap failed: BOOTSTRAP_ADMIN_EMAIL is not a valid email address.';
    console.error(`[Bootstrap] ERROR: ${errorMsg}`);
    throw new Error(errorMsg);
  }

  // Validate password strength
  const passwordError = validatePasswordStrength(password);
  if (passwordError) {
    const errorMsg = `Initial Admin bootstrap failed: ${passwordError}`;
    console.error(`[Bootstrap] ERROR: ${errorMsg}`);
    throw new Error(errorMsg);
  }

  // 4. Verify MongoDB transaction support (replica set / sharded cluster)
  await verifyTransactionSupport(mongoose.connection);

  // 5. Multi-replica lock acquisition loop
  const ownerToken = crypto.randomUUID();
  let acquired = false;
  let attempts = 0;

  while (!acquired && attempts < MAX_WAIT_ATTEMPTS) {
    attempts++;
    const res = await tryAcquireBootstrapLock(ownerToken, LEASE_DURATION_MS);
    if (res.completed) {
      console.log('[Bootstrap] Initial Admin bootstrap completed by another instance while waiting.');
      return { status: 'already_completed' };
    }
    if (res.acquired) {
      acquired = true;
      break;
    }

    // Another replica is holding the lock. Check if it already completed.
    const checkStatus = await SystemLock.findOne({ key: BOOTSTRAP_LOCK_KEY });
    if (checkStatus && checkStatus.completed) {
      console.log('[Bootstrap] Initial Admin bootstrap completed by another instance.');
      return { status: 'already_completed' };
    }

    console.log(
      `[Bootstrap] Lock currently held by another replica. Waiting attempt ${attempts}/${MAX_WAIT_ATTEMPTS}...`
    );
    await sleep(WAIT_INTERVAL_MS);
  }

  if (!acquired) {
    throw new Error(
      `Initial Admin bootstrap lock acquisition timed out after ${MAX_WAIT_ATTEMPTS} attempts. Another instance holds the lease.`
    );
  }

  console.log('[Bootstrap] Acquired bootstrap lock. Executing atomic initialization transaction...');

  // 6. Execute atomic MongoDB transaction
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // a. Verify inside the transaction that this caller still holds an unexpired lock
      const currentLock = await SystemLock.findOne(
        {
          key: BOOTSTRAP_LOCK_KEY,
          ownerToken: ownerToken,
          locked: true,
          lockExpiresAt: { $gt: new Date() },
        },
        null,
        { session }
      );

      if (!currentLock) {
        throw new Error('Bootstrap lock lease expired or was lost before transaction verification.');
      }

      // b. Verify inside transaction that no Admin exists
      const innerAdminCount = await User.countDocuments({ role: 'Admin' }).session(session);
      if (innerAdminCount > 0) {
        console.log('[Bootstrap] Admin was created concurrently or already exists. Marking complete.');
        currentLock.completed = true;
        currentLock.completedAt = new Date();
        currentLock.locked = false;
        currentLock.details = `Admin account detected during transaction (${innerAdminCount} found).`;
        await currentLock.save({ session });
        return;
      }

      // c. Create the initial Admin user via User.create so Mongoose bcrypt pre-save hook runs
      await User.create(
        [
          {
            name: name,
            email: email,
            password: password,
            employeeId: employeeId,
            designation: designation,
            role: 'Admin',
            leaveBalance: {
              casual: 12,
              restricted: 10,
              earned: 15,
              vacation: 11,
              ood: 10,
            },
          },
        ],
        { session }
      );

      // d. Mark bootstrap complete in SystemLock inside the same transaction
      currentLock.completed = true;
      currentLock.completedAt = new Date();
      currentLock.locked = false;
      currentLock.details = `Initial Admin bootstrap succeeded for email: ${email}`;
      await currentLock.save({ session });
    });

    console.log(
      `[Bootstrap] SUCCESS: Initial Admin created successfully for email: ${email}. Sensitive credentials were NOT logged.`
    );
    return { status: 'created', email };
  } catch (err) {
    console.error(`[Bootstrap] ERROR during bootstrap transaction: ${err.message}`);
    // Release lock early so subsequent attempts do not have to wait for lease expiration
    await SystemLock.updateOne(
      { key: BOOTSTRAP_LOCK_KEY, ownerToken: ownerToken, completed: false },
      { $set: { locked: false } }
    ).catch(() => {});
    throw err;
  } finally {
    await session.endSession();
  }
}

module.exports = {
  BOOTSTRAP_LOCK_KEY,
  LEASE_DURATION_MS,
  verifyTransactionSupport,
  validatePasswordStrength,
  validateEmail,
  tryAcquireBootstrapLock,
  ensureSystemLockIndex,
  bootstrapAdmin,
};


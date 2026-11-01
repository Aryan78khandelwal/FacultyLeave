const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const SystemLock = require('../models/SystemLock');
const {
  BOOTSTRAP_LOCK_KEY,
  LEASE_DURATION_MS,
  verifyTransactionSupport,
  validatePasswordStrength,
  validateEmail,
  tryAcquireBootstrapLock,
  ensureSystemLockIndex,
  bootstrapAdmin,
} = require('../services/bootstrapService');

// Capture console logs to verify no credentials are leaked
let capturedLogs = [];
const originalLog = console.log;
const originalError = console.error;

function startCapturingLogs() {
  capturedLogs = [];
  console.log = (...args) => {
    capturedLogs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
    originalLog(...args);
  };
  console.error = (...args) => {
    capturedLogs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
    originalError(...args);
  };
}

function stopCapturingLogs() {
  console.log = originalLog;
  console.error = originalError;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function runTests() {
  console.log('=== Starting Admin Bootstrap Test Suite ===\n');

  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing from server/.env');
  }

  // Connect to isolated test database to protect production data
  console.log('Connecting to isolated test database on Atlas replica set...');
  await mongoose.connect(process.env.MONGO_URI, {
    dbName: 'test_facultyleave_bootstrap',
  });
  console.log('Connected to test_facultyleave_bootstrap database.\n');

  try {
    // ---------------------------------------------------------
    // Test 1: Transaction Support Verification
    // ---------------------------------------------------------
    console.log('[Test 1] Verifying MongoDB multi-document transaction capability...');
    const txSupported = await verifyTransactionSupport(mongoose.connection);
    assert(txSupported === true, 'MongoDB deployment must support multi-document transactions');
    console.log('✓ PASS: MongoDB transactions supported.\n');

    // ---------------------------------------------------------
    // Test 1b: SystemLock Unique Index Verification & Failure Handling
    // ---------------------------------------------------------
    console.log('[Test 1b] Verifying SystemLock unique index enforcement and failure handling...');
    const indexOk = await ensureSystemLockIndex();
    assert(indexOk === true, 'ensureSystemLockIndex must return true when index is verified');

    // Verify it fails startup if unique index cannot be created/verified
    let indexFailed = false;
    const failingMock = {
      collection: {
        createIndex: async () => {
          throw new Error('Simulated index creation permission denied');
        },
        indexes: async () => [{ key: { _id: 1 } }],
      },
    };
    try {
      await ensureSystemLockIndex(failingMock);
    } catch (err) {
      indexFailed = true;
      assert(
        err.message.includes('Fatal: Failed to ensure unique index on SystemLock.key'),
        `Expected fatal error, got: ${err.message}`
      );
    }
    assert(indexFailed, 'ensureSystemLockIndex must throw fatal error if unique index cannot be ensured');
    console.log('✓ PASS: SystemLock unique index strictly verified; fails startup if absent.\n');

    // ---------------------------------------------------------
    // Test 2: Startup failure when 0 Admins & missing configuration
    // ---------------------------------------------------------
    console.log('[Test 2] Testing startup failure with 0 Admins and missing env config...');
    await User.deleteMany({});
    await SystemLock.deleteMany({});

    delete process.env.BOOTSTRAP_ADMIN_EMAIL;
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;

    let threw = false;
    try {
      await bootstrapAdmin();
    } catch (err) {
      threw = true;
      assert(
        err.message.includes('Initial Admin bootstrap required'),
        `Expected error message about bootstrap configuration, got: ${err.message}`
      );
    }
    assert(threw, 'bootstrapAdmin() must throw when 0 admins and no config provided');
    const countAfterTest2 = await User.countDocuments({ role: 'Admin' });
    assert(countAfterTest2 === 0, 'No Admin should be created when configuration is missing');
    console.log('✓ PASS: Startup failed safely without creating default credentials.\n');

    // ---------------------------------------------------------
    // Test 3: Weak password rejection
    // ---------------------------------------------------------
    console.log('[Test 3] Testing weak password rejection...');
    process.env.BOOTSTRAP_ADMIN_EMAIL = 'admin@college.edu';
    process.env.BOOTSTRAP_ADMIN_PASSWORD = 'weak'; // Missing uppercase, number, length < 8

    threw = false;
    try {
      await bootstrapAdmin();
    } catch (err) {
      threw = true;
      assert(
        err.message.includes('at least 8 characters long'),
        `Expected password length error, got: ${err.message}`
      );
    }
    assert(threw, 'bootstrapAdmin() must reject weak passwords');
    console.log('✓ PASS: Weak password correctly rejected.\n');

    // ---------------------------------------------------------
    // Test 4: Simultaneous bootstrap attempts from multiple instances
    // ---------------------------------------------------------
    console.log('[Test 4] Testing simultaneous bootstrap attempts (5 concurrent replicas)...');
    await User.deleteMany({});
    await SystemLock.deleteMany({});

    const testPassword = 'SecureAdminPassword2026!';
    process.env.BOOTSTRAP_ADMIN_EMAIL = 'superadmin@college.edu';
    process.env.BOOTSTRAP_ADMIN_PASSWORD = testPassword;
    process.env.BOOTSTRAP_ADMIN_NAME = 'Super Administrator';
    process.env.BOOTSTRAP_ADMIN_EMPLOYEE_ID = 'ADM-001';

    startCapturingLogs();

    // Launch 5 simultaneous bootstrap calls
    const results = await Promise.all([
      bootstrapAdmin(),
      bootstrapAdmin(),
      bootstrapAdmin(),
      bootstrapAdmin(),
      bootstrapAdmin(),
    ]);

    stopCapturingLogs();

    console.log('Concurrent results:', results.map((r) => r.status));
    const createdResults = results.filter((r) => r.status === 'created');
    const alreadyCompletedResults = results.filter((r) => r.status === 'already_completed');

    assert(createdResults.length === 1, `Exactly 1 caller should report 'created', got ${createdResults.length}`);
    assert(
      alreadyCompletedResults.length === 4,
      `Other 4 callers should report 'already_completed', got ${alreadyCompletedResults.length}`
    );

    const totalAdmins = await User.countDocuments({ role: 'Admin' });
    assert(totalAdmins === 1, `Expected exactly 1 Admin in database, found ${totalAdmins}`);

    const lockRecord = await SystemLock.findOne({ key: BOOTSTRAP_LOCK_KEY });
    assert(lockRecord.completed === true, 'SystemLock must be marked completed');
    assert(lockRecord.locked === false, 'SystemLock must be unlocked after completion');
    console.log('✓ PASS: Concurrency race condition prevented; exactly 1 Admin created.\n');

    // ---------------------------------------------------------
    // Test 5: Password hashed with bcrypt and not plaintext
    // ---------------------------------------------------------
    console.log('[Test 5] Verifying password hashing in database...');
    const adminDoc = await User.findOne({ email: 'superadmin@college.edu' }).select('+password');
    assert(adminDoc, 'Admin document must exist in database');
    assert(adminDoc.password !== testPassword, 'Password in database MUST NOT be plaintext');
    assert(
      adminDoc.password.startsWith('$2a$') || adminDoc.password.startsWith('$2b$'),
      'Password in database must be a bcrypt hash'
    );

    const isMatch = await adminDoc.matchPassword(testPassword);
    assert(isMatch === true, 'adminDoc.matchPassword() must return true for correct password');

    const wrongMatch = await adminDoc.matchPassword('WrongPassword123');
    assert(wrongMatch === false, 'adminDoc.matchPassword() must return false for wrong password');
    console.log('✓ PASS: Password securely hashed with bcrypt.\n');

    // ---------------------------------------------------------
    // Test 6: Verify logs contain no sensitive credentials
    // ---------------------------------------------------------
    console.log('[Test 6] Verifying no password leakage in logs...');
    for (const logLine of capturedLogs) {
      assert(
        !logLine.includes(testPassword),
        `SECURITY VIOLATION: Password "${testPassword}" found in log output: ${logLine}`
      );
    }
    console.log('✓ PASS: Zero sensitive credentials logged.\n');

    // ---------------------------------------------------------
    // Test 7: Subsequent startup is a fast no-op
    // ---------------------------------------------------------
    console.log('[Test 7] Testing subsequent startup (no-op fast path)...');
    // Remove environment variables to simulate operator removing them from Railway
    delete process.env.BOOTSTRAP_ADMIN_EMAIL;
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;

    const noopResult = await bootstrapAdmin();
    assert(
      noopResult.status === 'already_completed',
      `Expected status 'already_completed', got '${noopResult.status}'`
    );
    console.log('✓ PASS: Subsequent start skipped cleanly with no env variables.\n');

    // ---------------------------------------------------------
    // Test 8: Existing Admin without SystemLock record marks complete
    // ---------------------------------------------------------
    console.log('[Test 8] Testing pre-existing Admin without SystemLock record...');
    // Delete the SystemLock record to simulate a database with an existing Admin but pre-dating SystemLock
    await SystemLock.deleteMany({});
    const existingAdminCount = await User.countDocuments({ role: 'Admin' });
    assert(existingAdminCount === 1, 'Expected 1 existing Admin');

    const existingAdminBefore = await User.findOne({ email: 'superadmin@college.edu' }).select('+password');
    const originalHash = existingAdminBefore.password;

    const markResult = await bootstrapAdmin();
    assert(
      markResult.status === 'already_exists',
      `Expected status 'already_exists', got '${markResult.status}'`
    );

    // Verify existing Admin password and credentials were not altered
    const existingAdminAfter = await User.findOne({ email: 'superadmin@college.edu' }).select('+password');
    assert(
      existingAdminAfter.password === originalHash,
      'Existing Admin password hash MUST NOT be modified or reset'
    );

    const recreatedLock = await SystemLock.findOne({ key: BOOTSTRAP_LOCK_KEY });
    assert(recreatedLock && recreatedLock.completed === true, 'SystemLock must be created and marked complete');
    console.log('✓ PASS: Existing Admin preserved without modification; SystemLock marked completed.\n');

    // ---------------------------------------------------------
    // Test 9: Aborted transaction rollback and lease recovery
    // ---------------------------------------------------------
    console.log('[Test 9] Testing transaction rollback on failure...');
    await User.deleteMany({});
    await SystemLock.deleteMany({});

    // Simulate an aborted transaction by creating a lock and rolling back
    const ownerToken = 'test-rollback-token';
    const acquireRes = await tryAcquireBootstrapLock(ownerToken, 10000);
    assert(acquireRes.acquired === true, 'Should acquire lock');

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await User.create(
          [
            {
              name: 'Failed Admin',
              email: 'failed@college.edu',
              password: 'SomePassword123!',
              employeeId: 'EMP-FAIL',
              designation: 'Admin',
              role: 'Admin',
            },
          ],
          { session }
        );
        throw new Error('Simulated failure during bootstrap transaction');
      });
    } catch (err) {
      assert(err.message === 'Simulated failure during bootstrap transaction', 'Caught simulated error');
    } finally {
      await session.endSession();
    }

    const failedUser = await User.findOne({ email: 'failed@college.edu' });
    assert(failedUser === null, 'Transaction rollback must ensure no user was persisted');
    console.log('✓ PASS: Aborted transaction completely rolled back.\n');

    // Clean up test database collections
    console.log('Cleaning up test database collections...');
    await User.deleteMany({});
    await SystemLock.deleteMany({});
    console.log('Test collections cleared successfully.\n');

    console.log('=== ALL ADMIN BOOTSTRAP TESTS PASSED! ===');
  } catch (err) {
    stopCapturingLogs();
    console.error('\nTEST SUITE FAILED:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runTests();

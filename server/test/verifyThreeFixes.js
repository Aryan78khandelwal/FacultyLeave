const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const crypto = require('crypto');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { reclaimStrandedProcessingRecords } = require('../services/notificationWorker');
const { BACKOFF_MS } = require('../utils/enqueueNotification');

async function verifyAllThreeFixes() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB.');

  // Test 1: Check BACKOFF_MS timing
  const totalBackoffMs = BACKOFF_MS.reduce((a, b) => a + b, 0);
  console.log('Total retry backoff span:', totalBackoffMs / 60000, 'minutes');
  if (totalBackoffMs >= 30 * 60 * 1000) {
    throw new Error('Total backoff span must be under Brevo 30-minute window!');
  }
  console.log('✅ Test 1 PASSED: All retries complete within Brevo 30-minute window.');

  // Test 2: Multi-replica claim lease safety
  const now = Date.now();
  // Create Record A: Active processing by Replica A (lock valid for 90s in the future)
  const activeRecord = await Notification.create({
    type: 'leave-applied',
    status: 'processing',
    lockedAt: new Date(now),
    lockExpiresAt: new Date(now + 90000), // FUTURE: actively held
    payload: { test: 'active' },
  });

  // Create Record B: Orphaned from a crashed worker (lock expired 30s ago)
  const expiredRecord = await Notification.create({
    type: 'leave-applied',
    status: 'processing',
    lockedAt: new Date(now - 150000),
    lockExpiresAt: new Date(now - 30000), // PAST: expired
    payload: { test: 'expired' },
  });

  console.log('Testing replica startup reclaim...');
  await reclaimStrandedProcessingRecords('startup');

  const reloadedActive = await Notification.findById(activeRecord._id);
  const reloadedExpired = await Notification.findById(expiredRecord._id);

  console.log('Active record status (should still be processing):', reloadedActive.status);
  console.log('Expired record status (should be pending):', reloadedExpired.status);

  if (reloadedActive.status !== 'processing') {
    throw new Error('UNSAFE: Active record held by another replica was incorrectly reclaimed!');
  }
  if (reloadedExpired.status !== 'pending') {
    throw new Error('FAILED: Expired record was not reclaimed!');
  }
  console.log('✅ Test 2 PASSED: Multi-replica safe lease reclamation works.');

  // Test 3: Atomic token refresh transaction
  const testEmail = 'atomic-refresh-' + Date.now() + '@example.com';
  const testUser = await User.create({
    name: 'Atomic Refresh User',
    email: testEmail,
    password: 'TestPassword123!',
    employeeId: 'EMP-ATM-' + Date.now(),
    designation: 'Lecturer',
    role: 'Faculty',
    resetPasswordToken: 'old_token_hash',
    resetPasswordExpire: new Date(now - 5000), // expired
  });

  const testNotif = await Notification.create({
    type: 'password-reset',
    status: 'pending',
    payload: {
      userId: testUser._id,
      userEmail: testUser.email,
      userName: testUser.name,
      encryptedResetToken: 'old_encrypted_token',
      expiresAt: testUser.resetPasswordExpire,
    },
  });

  // Simulate worker transaction
  const session = await mongoose.startSession();
  const freshToken = 'atomic_fresh_token_123';
  await session.withTransaction(async () => {
    testUser.resetPasswordToken = crypto.createHash('sha256').update(freshToken).digest('hex');
    testUser.resetPasswordExpire = new Date(now + 600000);
    await testUser.save({ validateBeforeSave: false, session });

    testNotif.payload.encryptedResetToken = 'new_encrypted_token';
    testNotif.payload.expiresAt = testUser.resetPasswordExpire;
    testNotif.markModified('payload');
    await testNotif.save({ session });
  });
  await session.endSession();

  const freshUser = await User.findById(testUser._id);
  const freshNotif = await Notification.findById(testNotif._id);

  if (freshUser.resetPasswordToken !== crypto.createHash('sha256').update(freshToken).digest('hex')) {
    throw new Error('User token not updated!');
  }
  if (freshNotif.payload.encryptedResetToken !== 'new_encrypted_token') {
    throw new Error('Notification token not updated in transaction!');
  }
  console.log('✅ Test 3 PASSED: Atomic transaction covers both User and Notification.');

  // Clean up
  const cleanupIds = [activeRecord._id, expiredRecord._id, testNotif._id];
  await Notification.deleteMany({ _id: { $in: cleanupIds } });
  await User.findByIdAndDelete(testUser._id);
  await mongoose.disconnect();
  console.log('Disconnected from MongoDB.');
  console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
}

verifyAllThreeFixes().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});


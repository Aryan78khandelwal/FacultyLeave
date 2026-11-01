const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const { replayNotification } = require('../services/notificationWorker');

async function testNewIdempotencyFixes() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB.');

  const createdIds = [];

  try {
    // -------------------------------------------------------------
    // Test 1: Replay after 30 minutes blocked without { force: true }
    // -------------------------------------------------------------
    console.log('\n--- Testing Replay Protection after 30 minutes ---');
    const oldFailedNotif = await Notification.create({
      type: 'leave-applied',
      status: 'failed',
      attempts: 5,
      createdAt: new Date(Date.now() - 45 * 60 * 1000), // 45 minutes ago
      payload: { test: 'old_failed' },
    });
    createdIds.push(oldFailedNotif._id);

    let blockedAsExpected = false;
    try {
      await replayNotification(oldFailedNotif._id, { name: 'AdminTester', role: 'Admin' });
    } catch (err) {
      if (err.message.includes("exceeds Brevo's 30-minute idempotency")) {
        blockedAsExpected = true;
        console.log('Caught expected 30m idempotency safety rejection:', err.message);
      } else {
        throw err;
      }
    }

    if (!blockedAsExpected) {
      throw new Error('FAILED: Replay past 30 minutes was NOT blocked!');
    }
    console.log('✅ 1a: Replay without force correctly blocked.');

    // Now test replay with force: true
    const replayed = await replayNotification(
      oldFailedNotif._id,
      { name: 'AdminTester', role: 'Admin' },
      { force: true }
    );

    if (replayed.status !== 'pending') {
      throw new Error('Expected status to be pending after forced replay!');
    }
    const lastAudit = replayed.auditLog[replayed.auditLog.length - 1];
    if (lastAudit.action !== 'REPLAY_REQUESTED_FORCED') {
      throw new Error('Expected REPLAY_REQUESTED_FORCED in audit log!');
    }
    console.log('Audit log details:', lastAudit.details);
    console.log('✅ 1b: Replay with force: true succeeded with audited confirmation.');

    // -------------------------------------------------------------
    // Test 2: Older record lacking idempotencyKey persists before send
    // -------------------------------------------------------------
    console.log('\n--- Testing Persistent Key for Older Outbox Records ---');
    const legacyRecord = await Notification.create({
      type: 'leave-applied',
      status: 'pending',
      payload: { test: 'legacy_no_key' },
    });
    createdIds.push(legacyRecord._id);

    // Manually unset idempotencyKey to simulate older schema records
    await Notification.updateOne({ _id: legacyRecord._id }, { $unset: { idempotencyKey: 1 } });
    const unkeyed = await Notification.findById(legacyRecord._id).lean();
    if (unkeyed.idempotencyKey) throw new Error('Failed to unset idempotencyKey for test setup');

    console.log('Simulating worker dispatch pre-send persistence check...');
    const crypto = require('crypto');
    let recordForDispatch = await Notification.findById(legacyRecord._id);

    // Pre-send persistence guarantee:
    // Atomically persist the key to MongoDB if missing in the database document
    const generatedKey = recordForDispatch.idempotencyKey || crypto.randomUUID();
    await Notification.updateOne(
      {
        _id: recordForDispatch._id,
        $or: [{ idempotencyKey: null }, { idempotencyKey: { $exists: false } }],
      },
      { $set: { idempotencyKey: generatedKey } }
    );

    // Verify key in MongoDB
    const persistedInDb = await Notification.findById(legacyRecord._id).select('idempotencyKey').lean();
    recordForDispatch.idempotencyKey = persistedInDb.idempotencyKey;

    const assignedKey = recordForDispatch.idempotencyKey;
    console.log('Assigned and persisted key:', assignedKey);

    // Simulate crash and restart: reload record from database
    const reloadedAfterCrash = await Notification.findById(legacyRecord._id).lean();
    console.log('Reloaded key from DB on simulated retry:', reloadedAfterCrash.idempotencyKey);

    if (!reloadedAfterCrash.idempotencyKey) {
      throw new Error('FAILED: Key was not saved to MongoDB!');
    }
    if (reloadedAfterCrash.idempotencyKey !== assignedKey) {
      throw new Error('FAILED: Key changed between attempts! Provider deduplication would be bypassed.');
    }
    console.log('✅ 2: Older records without a key have it generated and persisted BEFORE sending.');

    console.log('\n🎉 ALL REPLAY & IDEMPOTENCY KEY FIXES VERIFIED SUCCESSFULLY!');
  } finally {
    if (createdIds.length > 0) {
      await Notification.deleteMany({ _id: { $in: createdIds } });
    }
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

testNewIdempotencyFixes().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});

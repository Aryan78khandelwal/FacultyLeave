const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const User = require('../models/User');
const LeaveRequest = require('../models/LeaveRequest');

/**
 * Concurrent Integration Test for Leave Overlap Guard
 *
 * Verifies that two simultaneous leave submissions for the exact same faculty member
 * and overlapping dates CANNOT both succeed (eliminates write-skew via the atomic
 * User._leaveGuard counter increment).
 */
const runConcurrentTest = async () => {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not configured in .env. Skipping integration test.');
    process.exit(1);
  }

  console.log('Connecting to MongoDB Atlas replica set...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB.');

  const testEmail = `concurrent-test-${Date.now()}@example.com`;
  const testEmpId = `EMP-TEST-${Date.now()}`;

  let testUser = null;
  const createdLeaves = [];

  try {
    // 1. Create a temporary test user
    testUser = await User.create({
      name: 'Concurrent Test Faculty',
      email: testEmail,
      password: 'TestPassword123!',
      role: 'Faculty',
      employeeId: testEmpId,
      designation: 'Assistant Professor',
      _leaveGuard: 0,
      leaveBalance: { casual: 12, restricted: 10, earned: 15, vacation: 11, ood: 10 },
    });
    console.log(`Created test user: ${testUser._id} with _leaveGuard: ${testUser._leaveGuard}`);

    const startDate = new Date('2027-01-10T00:00:00.000Z');
    const endDate = new Date('2027-01-12T00:00:00.000Z');

    // Worker function simulating the atomic applyLeave transaction
    const attemptSubmission = async (requestId) => {
      const session = await mongoose.startSession();
      try {
        let result;
        await session.withTransaction(async () => {
          // Check overlap
          const concurrent = await LeaveRequest.findOne({
            facultyId: testUser._id,
            status: { $in: ['pending', 'approved'] },
            startDate: { $lte: endDate },
            endDate: { $gte: startDate },
          }).session(session);

          if (concurrent) {
            throw Object.assign(new Error(`Overlap detected with request ${concurrent._id}`), { _overlap: true });
          }

          // Counter increment guard write
          await User.updateOne(
            { _id: testUser._id },
            { $inc: { _leaveGuard: 1 } },
            { session }
          );

          // Create leave
          const [created] = await LeaveRequest.create(
            [{
              facultyId: testUser._id,
              leaveType: 'casual',
              startDate,
              endDate,
              totalDays: 3,
              calendarDays: 3,
              reason: `Concurrent test submission ${requestId}`,
              status: 'pending',
            }],
            { session }
          );

          result = created;
        });

        await session.endSession();
        return { success: true, requestId, leaveId: result._id };
      } catch (err) {
        await session.endSession();
        return { success: false, requestId, error: err.message, isWriteConflict: Boolean(err.hasErrorLabel && err.hasErrorLabel('TransientTransactionError')) || Boolean(err._overlap) };
      }
    };

    console.log('Firing two simultaneous submissions for the exact same faculty & overlapping date range...');

    // Fire both simultaneously
    const results = await Promise.all([
      attemptSubmission('SUBMISSION_A'),
      attemptSubmission('SUBMISSION_B'),
    ]);

    console.log('Submission results:', results);

    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    console.log(`Successes: ${successes.length}, Failures: ${failures.length}`);

    // Verify in database: exactly ONE leave request must exist
    const actualLeaves = await LeaveRequest.find({
      facultyId: testUser._id,
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
    });

    console.log(`Actual leaves in database for this duration: ${actualLeaves.length}`);
    for (const l of actualLeaves) {
      createdLeaves.push(l._id);
    }

    if (actualLeaves.length !== 1) {
      throw new Error(`TEST FAILED: Expected exactly 1 leave in DB, found ${actualLeaves.length}! Write-skew occurred!`);
    }

    if (successes.length !== 1 || failures.length !== 1) {
      throw new Error(`TEST FAILED: Expected 1 success and 1 failure, got ${successes.length} successes and ${failures.length} failures.`);
    }

    const updatedUser = await User.findById(testUser._id);
    console.log(`Updated user _leaveGuard counter: ${updatedUser._leaveGuard} (incremented reliably)`);

    console.log('✅ CONCURRENT INTEGRATION TEST PASSED! The _leaveGuard increment successfully prevents write-skew.');
  } finally {
    // Cleanup
    if (createdLeaves.length > 0) {
      await LeaveRequest.deleteMany({ _id: { $in: createdLeaves } });
      console.log('Cleaned up test leave records.');
    }
    if (testUser) {
      await User.findByIdAndDelete(testUser._id);
      console.log('Cleaned up test user.');
    }
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
};

runConcurrentTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test execution error:', err);
    process.exit(1);
  });


const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

const User = require('./models/User');
const SystemLock = require('./models/SystemLock');
const { verifyTransactionSupport } = require('./services/bootstrapService');

/**
 * Diagnostic tool for inspecting database status safely in a strictly read-only mode.
 * - Does NOT create or modify any accounts.
 * - Does NOT select or print passwords, hashes, reset tokens, or sensitive credentials.
 */
const runDiagnostics = async () => {
  console.log('--- MongoDB Read-Only Diagnostics ---');

  if (!process.env.MONGO_URI) {
    console.error('ERROR: MONGO_URI is not set in environment variables.');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Database connection: OK');

    // 1. Transaction support check
    try {
      await verifyTransactionSupport(mongoose.connection);
      console.log('Transaction support: OK (Replica set / sharded cluster detected)');
    } catch (txErr) {
      console.warn(`Transaction support warning: ${txErr.message}`);
    }

    // 2. User statistics
    const totalUsers = await User.countDocuments();
    const adminCount = await User.countDocuments({ role: 'Admin' });
    const facultyCount = await User.countDocuments({ role: 'Faculty' });
    const hodCount = await User.countDocuments({ role: 'HOD' });
    console.log(`Total users: ${totalUsers} (Admins: ${adminCount}, HODs: ${hodCount}, Faculty: ${facultyCount})`);

    // 3. SystemLock bootstrap status
    const bootstrapLock = await SystemLock.findOne({ key: 'admin_bootstrap' }).lean();
    if (bootstrapLock) {
      console.log('Admin Bootstrap Status:');
      console.log(`  - Completed: ${bootstrapLock.completed}`);
      console.log(`  - CompletedAt: ${bootstrapLock.completedAt ? bootstrapLock.completedAt.toISOString() : 'N/A'}`);
      console.log(`  - Locked: ${bootstrapLock.locked}`);
      console.log(`  - Details: ${bootstrapLock.details || 'None'}`);
    } else {
      console.log('Admin Bootstrap Status: No bootstrap lock record exists in database.');
    }

    // 4. Safe User Listing (Strictly excluding passwords, reset tokens, secrets)
    const users = await User.find()
      .select('_id name email role employeeId designation department createdAt')
      .lean();

    if (users.length === 0) {
      console.log('No user records found in database.');
    } else {
      console.log(`Listing ${users.length} user(s) (safe metadata only):`);
      users.forEach((u, idx) => {
        console.log(
          `  ${idx + 1}. [${u.role}] ${u.name} | Email: ${u.email} | EmpID: ${u.employeeId} | Designation: ${u.designation}`
        );
      });
    }
  } catch (error) {
    console.error('Diagnostics error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database.');
    process.exit(0);
  }
};

runDiagnostics();

const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const Department = require('../models/Department');
const Notification = require('../models/Notification');
const authRoutes = require('../routes/authRoutes');
const userRoutes = require('../routes/userRoutes');
const { sendAccountCreatedEmail } = require('../services/emailService');
const { reclaimStrandedProcessingRecords } = require('../services/notificationWorker');

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function runAccountCreationTests() {
  console.log('=== Starting Account Creation & Password Workflow Test Suite ===\n');

  if (!process.env.MONGO_URI || !process.env.JWT_SECRET) {
    throw new Error('MONGO_URI or JWT_SECRET is missing from server/.env');
  }

  // Connect explicitly to an isolated test database to protect production/application data
  await mongoose.connect(process.env.MONGO_URI, {
    dbName: 'test_facultyleave_account_creation',
  });
  console.log('Connected to isolated test_facultyleave_account_creation database on Atlas.\n');

  // Set up Express test app with auth and user routes
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api`;
  console.log(`Test Express server running at: ${baseUrl}\n`);

  let adminUser, testDept, createdUser;

  try {
    // Ensure clean state in isolated test database
    await User.deleteMany({});
    await Department.deleteMany({});
    await Notification.deleteMany({});

    // 1. Create an Admin user to authorize Admin endpoints
    adminUser = await User.create({
      name: 'Test Administrator',
      email: `admin-${Date.now()}@college.edu`,
      password: 'AdminPassword123!',
      employeeId: 'ADM-TEST-001',
      designation: 'Administrator',
      role: 'Admin',
    });

    testDept = await Department.create({
      name: `Computer Science-${Date.now()}`,
    });

    const adminToken = jwt.sign({ id: adminUser._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // ---------------------------------------------------------
    // Test 1: Admin creates a user with an initial password
    // ---------------------------------------------------------
    console.log('[Test 1] Testing user creation with Admin-set initial password...');
    const initialPassword = 'InitialFacultyPass2026!';
    const userEmail = `faculty-${Date.now()}@college.edu`;

    const createRes = await fetch(`${baseUrl}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'John Doe Faculty',
        email: userEmail,
        role: 'Faculty',
        employeeId: `EMP-${Date.now()}`,
        designation: 'Assistant Professor',
        department: testDept._id,
        password: initialPassword,
      }),
    });

    assert(createRes.status === 201, `Expected status 201 on user creation, got: ${createRes.status}`);
    const createData = await createRes.json();
    assert(createData.success === true, 'Response success must be true');
    assert(createData.user, 'Response must contain user object');
    assert(createData.user.password === undefined, 'SECURITY: API response MUST NOT contain the password field');
    assert(
      createData.message === 'User created successfully.',
      `Expected message 'User created successfully.', got: ${createData.message}`
    );
    console.log('✓ PASS: User created successfully; password excluded from API response.\n');

    // ---------------------------------------------------------
    // Test 2: Password is stored only as a bcrypt hash in DB
    // ---------------------------------------------------------
    console.log('[Test 2] Verifying password is stored ONLY as a bcrypt hash...');
    const dbUser = await User.findOne({ email: userEmail }).select('+password');
    assert(dbUser, 'User must exist in database');
    assert(dbUser.password !== initialPassword, 'SECURITY: Password in database MUST NOT be plaintext');
    assert(
      dbUser.password.startsWith('$2a$') || dbUser.password.startsWith('$2b$'),
      'Password in database must be a bcrypt hash'
    );
    console.log('✓ PASS: Password stored only as a bcrypt hash via User pre-save hook.\n');

    // ---------------------------------------------------------
    // Test 3: Notification outbox payload contains NO raw or encrypted passwords
    // ---------------------------------------------------------
    console.log('[Test 3] Verifying notification outbox payload has no credentials...');
    const notification = await Notification.findOne({
      type: 'account-created',
      'payload.user.email': userEmail,
    });
    assert(notification, 'Outbox notification must be created');
    assert(
      notification.payload.encryptedPassword === undefined,
      'SECURITY: Outbox payload MUST NOT contain encryptedPassword'
    );
    assert(
      notification.payload.rawPassword === undefined,
      'SECURITY: Outbox payload MUST NOT contain rawPassword'
    );
    assert(
      notification.payload.password === undefined,
      'SECURITY: Outbox payload MUST NOT contain password'
    );
    assert(notification.payload.user.name === 'John Doe Faculty', 'Payload must contain non-sensitive user metadata');
    assert(notification.payload.user.email === userEmail, 'Payload must contain non-sensitive user metadata');
    console.log('✓ PASS: Outbox payload is strictly sanitized (no credentials stored).\n');

    // ---------------------------------------------------------
    // Test 4: Account-created welcome email contains NO password
    // ---------------------------------------------------------
    console.log('[Test 4] Verifying welcome email template contains no password...');
    const https = require('https');
    const stream = require('stream');
    let interceptedBody = '';
    const originalRequest = https.request;

    https.request = (opts, cb) => {
      if (opts.hostname === 'api.brevo.com') {
        const mockReq = new stream.PassThrough();
        let bodyChunks = [];
        mockReq.write = (chunk) => {
          bodyChunks.push(chunk);
          return true;
        };
        mockReq.end = () => {
          interceptedBody = Buffer.concat(bodyChunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c)))).toString();
          const mockRes = new stream.PassThrough();
          mockRes.statusCode = 201;
          cb(mockRes);
          mockRes.emit('data', JSON.stringify({ messageId: 'mock-test-id' }));
          mockRes.emit('end');
        };
        return mockReq;
      }
      return originalRequest(opts, cb);
    };

    try {
      await sendAccountCreatedEmail(notification.payload.user, { idempotencyKey: 'test-idemp-1' });
      assert(interceptedBody.length > 0, 'Brevo email dispatch should have been triggered');
      const parsedBrevoBody = JSON.parse(interceptedBody);
      assert(
        !parsedBrevoBody.htmlContent.includes(initialPassword),
        'SECURITY: Email body MUST NOT contain the initial password'
      );
      assert(
        !parsedBrevoBody.htmlContent.includes('Password:'),
        'SECURITY: Email body MUST NOT contain password label'
      );
      assert(
        parsedBrevoBody.htmlContent.includes(userEmail),
        'Email body must contain non-sensitive user email'
      );
      assert(
        parsedBrevoBody.htmlContent.includes('/login'),
        'Email body must contain login page link'
      );
    } finally {
      https.request = originalRequest;
    }
    console.log('✓ PASS: Welcome email contains only non-sensitive account information and login link.\n');

    // ---------------------------------------------------------
    // Test 5: User can log in normally with Admin-set password
    // ---------------------------------------------------------
    console.log('[Test 5] Testing normal login with Admin-set password...');
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail,
        password: initialPassword,
      }),
    });

    assert(loginRes.status === 200, `Expected status 200 on login, got: ${loginRes.status}`);
    const loginData = await loginRes.json();
    assert(loginData.success === true, 'Login success must be true');
    assert(loginData.token, 'Login must return a JWT token');
    const userToken = loginData.token;

    // Verify wrong password fails
    const badLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail,
        password: 'WrongPassword123!',
      }),
    });
    assert(badLoginRes.status === 401, `Expected status 401 for bad password, got: ${badLoginRes.status}`);
    console.log('✓ PASS: User logged in normally with Admin-set password; wrong password rejected.\n');

    // ---------------------------------------------------------
    // Test 6: User changes password through existing profile feature
    // ---------------------------------------------------------
    console.log('[Test 6] Testing password update through profile feature...');
    const newPassword = 'NewUserSelfChosenPass2026!';
    const profileRes = await fetch(`${baseUrl}/users/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        password: newPassword,
      }),
    });

    assert(profileRes.status === 200, `Expected status 200 on profile update, got: ${profileRes.status}`);
    const profileData = await profileRes.json();
    assert(profileData.success === true, 'Profile update must be successful');
    assert(profileData.user.password === undefined, 'Profile response MUST NOT contain password');

    // Verify user can now log in with the new password
    const newLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail,
        password: newPassword,
      }),
    });
    assert(newLoginRes.status === 200, `Expected status 200 with new password, got: ${newLoginRes.status}`);

    // Verify old Admin-set password no longer works
    const oldLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail,
        password: initialPassword,
      }),
    });
    assert(oldLoginRes.status === 401, `Old password must be rejected with 401, got: ${oldLoginRes.status}`);
    console.log('✓ PASS: Profile password update succeeds; new password works and old password invalidated.\n');

    // ---------------------------------------------------------
    // Test 7: Legacy pending notification sanitization on startup
    // ---------------------------------------------------------
    console.log('[Test 7] Testing handling and sanitization of legacy pending notifications...');
    // Create a mock legacy notification that still holds encryptedPassword & rawPassword
    const legacyNotification = await Notification.create({
      type: 'account-created',
      status: 'pending',
      payload: {
        user: {
          name: 'Legacy User',
          email: 'legacy@college.edu',
          role: 'Faculty',
          employeeId: 'EMP-LEGACY',
        },
        encryptedPassword: 'legacy-encrypted-credential-block',
        rawPassword: 'legacy-plaintext-password',
      },
    });

    // Run the startup reclamation & sanitization routine
    await reclaimStrandedProcessingRecords('startup');

    // Re-query the legacy record from MongoDB
    const sanitizedRecord = await Notification.findById(legacyNotification._id);
    assert(
      sanitizedRecord.payload.encryptedPassword === undefined,
      'Legacy encryptedPassword MUST be stripped from MongoDB on startup'
    );
    assert(
      sanitizedRecord.payload.rawPassword === undefined,
      'Legacy rawPassword MUST be stripped from MongoDB on startup'
    );
    console.log('✓ PASS: Legacy account-created records sanitized on startup; passwords permanently stripped.\n');

    console.log('=== ALL ACCOUNT CREATION & PASSWORD TESTS PASSED! ===');
  } finally {
    // Teardown test database
    console.log('Cleaning up test data...');
    try {
      await User.deleteMany({});
      await Department.deleteMany({});
      await Notification.deleteMany({});
    } catch (e) {
      console.warn('Cleanup error:', e.message);
    }
    server.close();
    await mongoose.disconnect();
    console.log('Teardown complete.');
  }
}

runAccountCreationTests().catch((err) => {
  console.error('\nACCOUNT CREATION TEST FAILED:', err);
  process.exit(1);
});

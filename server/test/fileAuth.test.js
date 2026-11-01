const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const Department = require('../models/Department');
const LeaveRequest = require('../models/LeaveRequest');
const fileRoutes = require('../routes/fileRoutes');

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function runFileAuthTests() {
  console.log('=== Starting File Authorization Test Suite ===\n');

  if (!process.env.MONGO_URI || !process.env.JWT_SECRET) {
    throw new Error('MONGO_URI or JWT_SECRET is missing from server/.env');
  }

  // Connect to isolated test database to protect production/application data
  await mongoose.connect(process.env.MONGO_URI, {
    dbName: 'test_facultyleave_fileauth',
  });
  console.log('Connected to isolated test_facultyleave_fileauth database on Atlas.');

  // Set up Express test app
  const app = express();
  app.use(express.json());
  app.use('/api/files', fileRoutes);

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/files`;
  console.log(`Test Express server running at: ${baseUrl}\n`);

  // Paths
  const uploadsDir = path.resolve(__dirname, '../uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const testFilename = `test-auth-${Date.now()}.pdf`;
  const orphanFilename = `test-orphan-${Date.now()}.pdf`;
  const testFilePath = path.join(uploadsDir, testFilename);
  const orphanFilePath = path.join(uploadsDir, orphanFilename);

  // Write temporary test files to disk
  fs.writeFileSync(testFilePath, 'SECURE_TEST_LEAVE_DOCUMENT_CONTENT');
  fs.writeFileSync(orphanFilePath, 'ORPHAN_FILE_NOT_IN_LEAVE_REQUEST');

  let testLeave, deptA, deptB, faculty1, faculty2, faculty3, hodA, hodB, adminUser;

  try {
    // Ensure clean state in isolated test database
    await LeaveRequest.deleteMany({});
    await User.deleteMany({});
    await Department.deleteMany({});

    // Create test departments
    deptA = await Department.create({ name: `DeptA-${Date.now()}` });
    deptB = await Department.create({ name: `DeptB-${Date.now()}` });

    // Create test users
    faculty1 = await User.create({
      name: 'Faculty One (Owner)',
      email: `faculty1-${Date.now()}@test.edu`,
      password: 'Password123!',
      employeeId: `EMP-${Date.now()}-1`,
      designation: 'Assistant Professor',
      role: 'Faculty',
      department: deptA._id,
    });

    faculty2 = await User.create({
      name: 'Faculty Two (Same Dept)',
      email: `faculty2-${Date.now()}@test.edu`,
      password: 'Password123!',
      employeeId: `EMP-${Date.now()}-2`,
      designation: 'Assistant Professor',
      role: 'Faculty',
      department: deptA._id,
    });

    faculty3 = await User.create({
      name: 'Faculty Three (Different Dept)',
      email: `faculty3-${Date.now()}@test.edu`,
      password: 'Password123!',
      employeeId: `EMP-${Date.now()}-3`,
      designation: 'Assistant Professor',
      role: 'Faculty',
      department: deptB._id,
    });

    hodA = await User.create({
      name: 'HOD A (Owner Dept HOD)',
      email: `hoda-${Date.now()}@test.edu`,
      password: 'Password123!',
      employeeId: `EMP-${Date.now()}-4`,
      designation: 'HOD',
      role: 'HOD',
      department: deptA._id,
    });

    hodB = await User.create({
      name: 'HOD B (Other Dept HOD)',
      email: `hodb-${Date.now()}@test.edu`,
      password: 'Password123!',
      employeeId: `EMP-${Date.now()}-5`,
      designation: 'HOD',
      role: 'HOD',
      department: deptB._id,
    });

    adminUser = await User.create({
      name: 'System Admin Tester',
      email: `admin-${Date.now()}@test.edu`,
      password: 'Password123!',
      employeeId: `EMP-${Date.now()}-6`,
      designation: 'Administrator',
      role: 'Admin',
    });

    // Update departments with HOD and faculty list
    deptA.hod = hodA._id;
    deptA.facultyList = [faculty1._id, faculty2._id];
    await deptA.save();

    deptB.hod = hodB._id;
    deptB.facultyList = [faculty3._id];
    await deptB.save();

    // Create LeaveRequest referencing testFilename
    testLeave = await LeaveRequest.create({
      facultyId: faculty1._id,
      leaveType: 'casual',
      startDate: new Date(),
      endDate: new Date(),
      totalDays: 1,
      reason: 'Medical checkup',
      status: 'pending',
      documents: `/uploads/${testFilename}`,
    });

    // Issue JWTs
    const tokenOptions = { expiresIn: '1h' };
    const faculty1Token = jwt.sign({ id: faculty1._id }, process.env.JWT_SECRET, tokenOptions);
    const faculty2Token = jwt.sign({ id: faculty2._id }, process.env.JWT_SECRET, tokenOptions);
    const faculty3Token = jwt.sign({ id: faculty3._id }, process.env.JWT_SECRET, tokenOptions);
    const hodAToken = jwt.sign({ id: hodA._id }, process.env.JWT_SECRET, tokenOptions);
    const hodBToken = jwt.sign({ id: hodB._id }, process.env.JWT_SECRET, tokenOptions);
    const adminToken = jwt.sign({ id: adminUser._id }, process.env.JWT_SECRET, tokenOptions);

    // ---------------------------------------------------------
    // Test 1: Query string token rejected (must require Authorization header)
    // ---------------------------------------------------------
    console.log('[Test 1] Testing rejection of ?token= query parameter without header...');
    const res1 = await fetch(`${baseUrl}/${testFilename}?token=${faculty1Token}`);
    assert(res1.status === 401, `Expected status 401 for query-param token, got: ${res1.status}`);
    const body1 = await res1.json();
    assert(body1.message.includes('no token provided'), `Expected 'no token provided', got: ${body1.message}`);
    console.log('✓ PASS: Query-string token rejected with 401.\n');

    // ---------------------------------------------------------
    // Test 2: Resource Owner can access their own leave document
    // ---------------------------------------------------------
    console.log('[Test 2] Testing owner access to their own leave document...');
    const res2 = await fetch(`${baseUrl}/${testFilename}`, {
      headers: { Authorization: `Bearer ${faculty1Token}` },
    });
    assert(res2.status === 200, `Expected status 200 for owner, got: ${res2.status}`);
    const text2 = await res2.text();
    assert(text2 === 'SECURE_TEST_LEAVE_DOCUMENT_CONTENT', 'File content must match');
    console.log('✓ PASS: Owner successfully retrieved file.\n');

    // ---------------------------------------------------------
    // Test 3: Different faculty in the SAME department is denied (403)
    // ---------------------------------------------------------
    console.log('[Test 3] Testing access by another faculty in the same department...');
    const res3 = await fetch(`${baseUrl}/${testFilename}`, {
      headers: { Authorization: `Bearer ${faculty2Token}` },
    });
    assert(res3.status === 403, `Expected status 403 for peer faculty, got: ${res3.status}`);
    const body3 = await res3.json();
    assert(body3.message.includes('Not authorized'), `Expected 'Not authorized', got: ${body3.message}`);
    console.log('✓ PASS: Peer faculty correctly denied with 403.\n');

    // ---------------------------------------------------------
    // Test 4: Faculty in a DIFFERENT department is denied (403)
    // ---------------------------------------------------------
    console.log('[Test 4] Testing access by faculty in a different department...');
    const res4 = await fetch(`${baseUrl}/${testFilename}`, {
      headers: { Authorization: `Bearer ${faculty3Token}` },
    });
    assert(res4.status === 403, `Expected status 403 for other dept faculty, got: ${res4.status}`);
    console.log('✓ PASS: Different department faculty correctly denied with 403.\n');

    // ---------------------------------------------------------
    // Test 5: HOD of the faculty\'s department can access file (200)
    // ---------------------------------------------------------
    console.log('[Test 5] Testing access by HOD of the owner\'s department...');
    const res5 = await fetch(`${baseUrl}/${testFilename}`, {
      headers: { Authorization: `Bearer ${hodAToken}` },
    });
    assert(res5.status === 200, `Expected status 200 for department HOD, got: ${res5.status}`);
    const text5 = await res5.text();
    assert(text5 === 'SECURE_TEST_LEAVE_DOCUMENT_CONTENT', 'HOD received correct content');
    console.log('✓ PASS: Department HOD successfully retrieved file.\n');

    // ---------------------------------------------------------
    // Test 6: HOD of a DIFFERENT department is denied (403)
    // ---------------------------------------------------------
    console.log('[Test 6] Testing access by HOD of a different department...');
    const res6 = await fetch(`${baseUrl}/${testFilename}`, {
      headers: { Authorization: `Bearer ${hodBToken}` },
    });
    assert(res6.status === 403, `Expected status 403 for other dept HOD, got: ${res6.status}`);
    console.log('✓ PASS: Different department HOD correctly denied with 403.\n');

    // ---------------------------------------------------------
    // Test 7: Admin has cross-system access (200)
    // ---------------------------------------------------------
    console.log('[Test 7] Testing Admin cross-system access...');
    const res7 = await fetch(`${baseUrl}/${testFilename}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(res7.status === 200, `Expected status 200 for Admin, got: ${res7.status}`);
    const text7 = await res7.text();
    assert(text7 === 'SECURE_TEST_LEAVE_DOCUMENT_CONTENT', 'Admin received correct content');
    console.log('✓ PASS: Admin successfully retrieved file.\n');

    // ---------------------------------------------------------
    // Test 8: File exists on disk but is NOT referenced by any LeaveRequest (404)
    // ---------------------------------------------------------
    console.log('[Test 8] Testing orphan file on disk not linked to any LeaveRequest...');
    const res8 = await fetch(`${baseUrl}/${orphanFilename}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(res8.status === 404, `Expected status 404 for unreferenced file, got: ${res8.status}`);
    console.log('✓ PASS: Unreferenced file returned 404 without leaking disk existence.\n');

    // ---------------------------------------------------------
    // Test 9: Non-existent file (404)
    // ---------------------------------------------------------
    console.log('[Test 9] Testing completely non-existent filename...');
    const res9 = await fetch(`${baseUrl}/does-not-exist-999.pdf`, {
      headers: { Authorization: `Bearer ${faculty1Token}` },
    });
    assert(res9.status === 404, `Expected status 404 for missing file, got: ${res9.status}`);
    console.log('✓ PASS: Non-existent file returned 404.\n');

    // ---------------------------------------------------------
    // Test 10: Path traversal defense (no escape from uploads)
    // ---------------------------------------------------------
    console.log('[Test 10] Testing path traversal attack defense...');
    const res10 = await fetch(`${baseUrl}/..%2Fserver.js`, {
      headers: { Authorization: `Bearer ${faculty1Token}` },
    });
    // Path traversal either gets sanitized to 'server.js' (which is not referenced by LeaveRequest -> 404)
    // or blocked with 403/404. It must NEVER return 200!
    assert(res10.status === 403 || res10.status === 404, `Expected 403 or 404, got: ${res10.status}`);
    console.log('✓ PASS: Path traversal attempt prevented.\n');

    // ---------------------------------------------------------
    // Test 11: Frontend api.js check (no tokens in URLs)
    // ---------------------------------------------------------
    console.log('[Test 11] Verifying frontend getFileUrl generates safe URLs without tokens...');
    const apiFileContent = fs.readFileSync(path.resolve(__dirname, '../../client/src/services/api.js'), 'utf8');
    assert(!apiFileContent.includes('token=${token}'), 'api.js MUST NOT append token to getFileUrl');
    assert(!apiFileContent.includes('?token='), 'api.js MUST NOT have query token logic');
    assert(apiFileContent.includes('viewProtectedFile'), 'api.js MUST export viewProtectedFile');
    assert(apiFileContent.includes("responseType: 'blob'"), "api.js MUST use responseType: 'blob'");
    console.log('✓ PASS: Frontend api.js strictly enforces Bearer auth and blob viewing.\n');

    console.log('=== ALL FILE AUTHORIZATION TESTS PASSED! ===');
  } finally {
    // Teardown test files and clean isolated collections
    console.log('Cleaning up test data...');
    if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
    if (fs.existsSync(orphanFilePath)) fs.unlinkSync(orphanFilePath);

    try {
      await LeaveRequest.deleteMany({});
      await User.deleteMany({});
      await Department.deleteMany({});
    } catch (cleanupErr) {
      console.warn('Warning: Could not clean test collections:', cleanupErr.message);
    }

    server.close();
    await mongoose.disconnect();
    console.log('Teardown complete.');
  }
}

runFileAuthTests().catch((err) => {
  console.error('\nFILE AUTH TEST FAILED:', err);
  process.exit(1);
});


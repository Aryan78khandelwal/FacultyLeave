const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

const User = require('./models/User');

const runDiagnostics = async () => {
  console.log('Connecting to database...');
  console.log(`URI: ${process.env.MONGO_URI ? 'Loaded (starts with ' + process.env.MONGO_URI.substring(0, 20) + '...)' : 'MISSING'}`);

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Database connection successful!');

    const userCount = await User.countDocuments();
    console.log(`Total users in database: ${userCount}`);

    const users = await User.find().select('+password');
    if (users.length === 0) {
      console.log('No users found. Database is empty.');
      
      console.log('Creating Admin user manually...');
      const admin = await User.create({
        name: 'System Administrator',
        email: 'admin@college.edu',
        password: 'AdminPassword123',
        employeeId: 'EMP-ADMIN-001',
        designation: 'System Administrator',
        role: 'Admin',
        leaveBalance: { casual: 12, restricted: 10, earned: 15 }
      });
      console.log('Created Admin user successfully!');
      console.log('Email: admin@college.edu');
      console.log('Password: AdminPassword123');
    } else {
      console.log('Users list:');
      users.forEach(u => {
        console.log(`- Name: ${u.name}, Email: ${u.email}, Role: ${u.role}, EmpID: ${u.employeeId}`);
      });
    }
  } catch (error) {
    console.error('Database connection / query failed:');
    console.error(error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

runDiagnostics();

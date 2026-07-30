const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');

// Load environment variables
dotenv.config();

const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorMiddleware');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const leaveRoutes = require('./routes/leaveRoutes');

// Import models for seeding
const User = require('./models/User');

const app = express();

// Connect to Database
connectDB().then(() => {
  // Seed initial Admin if database is empty
  seedAdmin();
});

// Security HTTP headers
app.use(helmet({
  crossOriginResourcePolicy: false, // Essential for allowing frontend to load local upload images
}));

// CORS setup
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

// HTTP request logger
app.use(morgan('dev'));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting (100 requests per 15 minutes per IP)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Too many requests from this IP, please try again after 15 minutes',
});
app.use('/api/', limiter);

// Serve uploads statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/leaves', leaveRoutes);

// Base route for health check
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Faculty Leave Management System API' });
});

// Centralized error handler middleware
app.use(errorHandler);

// Seeding function for Default Admin
async function seedAdmin() {
  try {
    const adminCount = await User.countDocuments({ role: 'Admin' });
    if (adminCount === 0) {
      console.log('Seeding default administrator...');
      await User.create({
        name: 'System Administrator',
        email: 'admin@college.edu',
        password: 'AdminPassword123', // Will be hashed automatically by userSchema pre-save hook
        employeeId: 'EMP-ADMIN-001',
        designation: 'System Administrator',
        role: 'Admin',
        leaveBalance: {
          casual: 12,
          sick: 10,
          earned: 15,
        },
      });
      console.log('Default administrator created successfully.');
      console.log('Email: admin@college.edu');
      console.log('Password: AdminPassword123');
    }
  } catch (err) {
    console.error('Failed to seed default administrator:', err.message);
  }
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

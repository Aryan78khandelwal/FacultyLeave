const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');

// Load environment variables
dotenv.config();

// === Critical Environment Variable Checks ===
if (!process.env.JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET is not defined in environment variables. Server cannot start.');
  process.exit(1);
}

const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorMiddleware');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const fileRoutes = require('./routes/fileRoutes');

// Import models for seeding
const User = require('./models/User');

const app = express();

// Trust first proxy (required for Railway, Render, Heroku, etc.)
// Ensures express-rate-limit reads the real client IP from X-Forwarded-For
app.set('trust proxy', 1);

// Connect to Database
connectDB().then(() => {
  // Seed initial Admin if database is empty
  seedAdmin();
});

// Security HTTP headers
app.use(helmet());

// CORS setup
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

// HTTP request logger (only active in development)
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting (general: 200 requests per 15 minutes per IP)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Too many requests from this IP, please try again after 15 minutes',
});
app.use('/api/', limiter);

// Stricter rate limit for auth endpoints (brute force / enumeration protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts from this IP, please try again after 15 minutes',
  skipSuccessfulRequests: true, // Only count failed attempts
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/forgotpassword', authLimiter);

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/files', fileRoutes); // Authenticated file serving (replaces public /uploads route)

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
          restricted: 10,
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

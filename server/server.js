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
const { startWorker } = require('./services/notificationWorker');
const { bootstrapAdmin } = require('./services/bootstrapService');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const fileRoutes = require('./routes/fileRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();

// Trust first proxy (required for Railway, Render, Heroku, etc.)
// Ensures express-rate-limit reads the real client IP from X-Forwarded-For
app.set('trust proxy', 1);

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
app.use('/api/notifications', notificationRoutes); // Monitored outbox queue & operator replay

// Base route for health check
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Faculty Leave Management System API' });
});

// Centralized error handler middleware
app.use(errorHandler);

// Start server after DB connection and Admin bootstrap succeed
const startServer = async () => {
  try {
    await connectDB();
    await bootstrapAdmin();
    startWorker();

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
    });
  } catch (err) {
    console.error('Fatal startup error:', err.message);
    process.exit(1);
  }
};

startServer();

module.exports = app;

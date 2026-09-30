const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // bcryptjs is a library that hash passwords and compare passwords securely.

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Please provide an email'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email address'],
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: 6,
      select: false, // Don't return password by default
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
    },
    role: {
      type: String,
      enum: ['Faculty', 'HOD', 'Admin', 'Instructor', 'SDA'],
      default: 'Faculty',
    },
    avatar: {
      type: String,
      default: '',
    },
    employeeId: {
      type: String,
      required: [true, 'Please provide an Employee ID'],
      trim: true,
    },
    designation: {
      type: String,
      required: [true, 'Please provide a designation'],
      trim: true,
    },
    leaveBalance: {
      casual: {
        type: Number,
        default: 12, // Default annual casual leaves
      },
      restricted: {
        type: Number,
        default: 10, // Default annual restricted leaves
      },
      earned: {
        type: Number,
        default: 15, // Default annual earned leaves
      },
      vacation: {
        type: Number,
        default: 11, // Default annual vacation leaves
      },
      ood: {
        type: Number,
        default: 10, // Default annual Official Duty leaves
      },
    },
    restrictedLeaveEnabled: {
      type: Boolean,
      default: true,
    },
    earnedLeaveEnabled: {
      type: Boolean,
      default: true,
    },
    vacationLeaveEnabled: {
      type: Boolean,
      default: true,
    },
    oodLeaveEnabled: {
      type: Boolean,
      default: true,
    },
    passwordChangedAt: Date,
    resetPasswordToken: String,
    resetPasswordExpire: Date,
  },
  {
    timestamps: true,
  }
);

// Encrypt password before saving & track password change time
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);

  // Record when the password was changed (skip on brand-new documents)
  if (!this.isNew) {
    this.passwordChangedAt = Date.now() - 1000; // subtract 1s to ensure token issued after save is valid
  }

  next();
});

// Compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);

// Compound unique index: same employeeId is allowed across different departments
// but cannot be duplicated within the same department.
// sparse: true ensures Admin users (department: null) don't block each other.
User.collection.createIndex(
  { employeeId: 1, department: 1 },
  { unique: true, sparse: true }
).catch(() => {}); // silently ignore if already exists

module.exports = User;

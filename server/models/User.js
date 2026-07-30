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
      enum: ['Faculty', 'HOD', 'Admin'],
      default: 'Faculty',
    },
    avatar: {
      type: String,
      default: '',
    },
    employeeId: {
      type: String,
      required: [true, 'Please provide an Employee ID'],
      unique: true,
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
      sick: {
        type: Number,
        default: 10, // Default annual sick leaves
      },
      earned: {
        type: Number,
        default: 15, // Default annual earned leaves
      },
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
  },
  {
    timestamps: true,
  }
);

// Encrypt password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);
module.exports = User;

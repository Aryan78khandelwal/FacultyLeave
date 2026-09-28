const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema(
  {
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    leaveType: {
      type: String,
      enum: ['casual', 'restricted', 'earned', 'vacation', 'ood'],
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    totalDays: {
      type: Number,
      required: true,
    },
    calendarDays: {
      type: Number,
      default: 0,
    },
    excludedDates: {
      type: [{
        date: Date,
        reason: String
      }],
      default: [],
    },
    reason: {
      type: String,
      required: [true, 'Please specify a reason for the leave'],
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'temporarily_approved', 'certificate_submitted', 'certificate_rejected'],
      default: 'pending',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    rejectionReason: {
      type: String,
      default: '',
    },
    documents: {
      type: String, // Storing filepath or URL
      default: '',
    },
    certificateDocument: {
      type: String, // Storing OOD certificate path
      default: '',
    },
    isPaidLeave: {
      type: Boolean,
      default: false,
    },
    duration: {
      type: String,
      enum: ['FULL_DAY', 'HALF_DAY'],
      default: 'FULL_DAY',
    },
    halfDayType: {
      type: String,
      enum: ['FIRST_HALF', 'SECOND_HALF', null],
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const LeaveRequest = mongoose.model('LeaveRequest', leaveRequestSchema);
module.exports = LeaveRequest;

const mongoose = require('mongoose');

const systemLockSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    locked: {
      type: Boolean,
      default: false,
    },
    lockedAt: {
      type: Date,
    },
    lockExpiresAt: {
      type: Date,
    },
    ownerToken: {
      type: String,
    },
    completed: {
      type: Boolean,
      default: false,
      index: true,
    },
    completedAt: {
      type: Date,
    },
    details: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

const SystemLock = mongoose.model('SystemLock', systemLockSchema);

// Ensure the unique index exists in MongoDB in production even if autoIndex is disabled
SystemLock.init().catch((err) => {
  console.error('[SystemLock] Index initialization error:', err.message);
});

module.exports = SystemLock;

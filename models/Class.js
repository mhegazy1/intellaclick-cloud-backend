const mongoose = require('mongoose');

const classSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  instructorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  semester: {
    type: String,
    default: ''
  },
  year: {
    type: Number,
    default: new Date().getFullYear()
  },
  students: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    studentId: String,
    name: String,
    email: String,
    enrolledAt: {
      type: Date,
      default: Date.now
    }
  }],
  sessions: [{
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session'
    },
    date: Date
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on save
classSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Generate unique class code
classSchema.statics.generateClassCode = function() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// Indexes for performance
classSchema.index({ instructorId: 1 });
classSchema.index({ code: 1 }, { unique: true });
classSchema.index({ isActive: 1 });

module.exports = mongoose.model('Class', classSchema);
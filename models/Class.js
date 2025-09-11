const mongoose = require('mongoose');

const classSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  code: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
    description: 'Course code like MATH101'
  },
  section: {
    type: String,
    trim: true,
    maxlength: 20,
    description: 'Section number or identifier'
  },
  term: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
    description: 'e.g., Fall 2024, Spring 2025'
  },
  description: {
    type: String,
    maxlength: 1000
  },
  
  // Instructor Information
  instructorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  coInstructors: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  teachingAssistants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Join Code System
  joinCode: {
    type: String,
    unique: true,
    sparse: true,
    uppercase: true,
    index: true
  },
  joinCodeExpiry: {
    type: Date,
    default: null
  },
  joinCodeUsageLimit: {
    type: Number,
    default: null,
    description: 'Max number of students who can use this code'
  },
  joinCodeUsageCount: {
    type: Number,
    default: 0
  },
  
  // Enrollment Settings
  enrollmentLimit: {
    type: Number,
    default: null,
    description: 'Maximum number of students allowed'
  },
  enrollmentDeadline: {
    type: Date,
    default: null
  },
  requireApproval: {
    type: Boolean,
    default: false,
    description: 'Whether instructor approval is required to join'
  },
  allowSelfEnrollment: {
    type: Boolean,
    default: true
  },
  
  // Class Settings
  settings: {
    allowLateJoin: {
      type: Boolean,
      default: true
    },
    showStudentNames: {
      type: Boolean,
      default: true,
      description: 'Whether students can see other student names'
    },
    allowAnonymousResponses: {
      type: Boolean,
      default: false
    },
    requireAttendance: {
      type: Boolean,
      default: false
    },
    gradeVisibility: {
      type: String,
      enum: ['immediate', 'after_submission', 'after_session', 'manual'],
      default: 'after_session'
    }
  },
  
  // Schedule Information
  schedule: {
    days: [{
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    }],
    startTime: String,
    endTime: String,
    timezone: {
      type: String,
      default: 'America/Chicago'
    },
    location: String
  },
  
  // Dates
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  
  // Stats
  stats: {
    enrolledCount: {
      type: Number,
      default: 0
    },
    droppedCount: {
      type: Number,
      default: 0
    },
    invitedCount: {
      type: Number,
      default: 0
    },
    lastSessionDate: Date,
    totalSessions: {
      type: Number,
      default: 0
    }
  },
  
  // Status
  status: {
    type: String,
    enum: ['draft', 'active', 'archived', 'deleted'],
    default: 'active',
    index: true
  },
  archivedAt: Date,
  deletedAt: Date
}, {
  timestamps: true
});

// Indexes for efficient queries
classSchema.index({ instructorId: 1, term: 1, status: 1 });
classSchema.index({ joinCode: 1, joinCodeExpiry: 1 });
classSchema.index({ code: 1, section: 1, term: 1 });

// Generate unique join code
classSchema.methods.generateJoinCode = async function() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const codeLength = 8;
  
  let attempts = 0;
  while (attempts < 10) {
    let code = '';
    for (let i = 0; i < codeLength; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    // Check if code already exists
    const existing = await this.constructor.findOne({ joinCode: code });
    if (!existing) {
      this.joinCode = code;
      // Default expiry is end of term plus 30 days
      if (!this.joinCodeExpiry) {
        const expiryDate = new Date(this.endDate);
        expiryDate.setDate(expiryDate.getDate() + 30);
        this.joinCodeExpiry = expiryDate;
      }
      return code;
    }
    attempts++;
  }
  
  throw new Error('Failed to generate unique join code');
};

// Check if join code is valid
classSchema.methods.isJoinCodeValid = function() {
  if (!this.joinCode) return false;
  if (this.joinCodeExpiry && new Date() > this.joinCodeExpiry) return false;
  if (this.joinCodeUsageLimit && this.joinCodeUsageCount >= this.joinCodeUsageLimit) return false;
  if (this.status !== 'active') return false;
  return true;
};

// Get display name for class
classSchema.virtual('displayName').get(function() {
  let name = `${this.code} - ${this.name}`;
  if (this.section) name += ` (Section ${this.section})`;
  return name;
});

// Check if enrollment is open
classSchema.methods.isEnrollmentOpen = function() {
  if (!this.allowSelfEnrollment) return false;
  if (this.enrollmentDeadline && new Date() > this.enrollmentDeadline) return false;
  if (this.enrollmentLimit && this.stats.enrolledCount >= this.enrollmentLimit) return false;
  if (this.status !== 'active') return false;
  return true;
};

// Update enrollment stats
classSchema.methods.updateEnrollmentStats = async function() {
  const Enrollment = mongoose.model('ClassEnrollment');
  
  const enrolled = await Enrollment.countDocuments({
    classId: this._id,
    status: 'enrolled'
  });
  
  const dropped = await Enrollment.countDocuments({
    classId: this._id,
    status: 'dropped'
  });
  
  this.stats.enrolledCount = enrolled;
  this.stats.droppedCount = dropped;
  
  return this.save();
};

// Increment join code usage
classSchema.methods.incrementJoinCodeUsage = async function() {
  this.joinCodeUsageCount = (this.joinCodeUsageCount || 0) + 1;
  return this.save();
};

module.exports = mongoose.model('Class', classSchema);
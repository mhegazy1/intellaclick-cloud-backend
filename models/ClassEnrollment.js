const mongoose = require('mongoose');

const classEnrollmentSchema = new mongoose.Schema({
  // Core Relationships
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true,
    index: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true
  },
  
  // Enrollment Details
  enrollmentMethod: {
    type: String,
    enum: [
      'join_code',          // Student used join code
      'instructor_added',   // Manually added by instructor
      'roster_upload',      // Added via CSV upload
      'invitation',         // Joined via email invitation
      'api',               // Added programmatically
      'admin'              // Added by system admin
    ],
    required: true
  },
  
  enrolledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    description: 'Who initiated the enrollment (instructor for manual adds)'
  },
  
  // Status
  status: {
    type: String,
    enum: [
      'enrolled',       // Active enrollment
      'dropped',        // Student dropped the class
      'withdrawn',      // Instructor removed student
      'pending',        // Awaiting approval (if requireApproval is true)
      'invited',        // Invitation sent, not yet accepted
      'blocked'         // Student blocked from class
    ],
    default: 'enrolled',
    index: true
  },
  
  // Important Dates
  enrolledAt: {
    type: Date,
    default: Date.now
  },
  droppedAt: Date,
  lastActivityAt: {
    type: Date,
    default: Date.now
  },
  
  // Invitation System
  invitation: {
    token: {
      type: String,
      unique: true,
      sparse: true
    },
    sentAt: Date,
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    expiresAt: Date,
    remindersSent: {
      type: Number,
      default: 0
    },
    lastReminderAt: Date
  },
  
  // Student Information Snapshot (for roster matching)
  rosterData: {
    originalName: String,          // Name from roster upload
    originalEmail: String,         // Email from roster
    studentId: String,            // University student ID
    additionalIdentifiers: {      // Any other IDs from roster
      type: Map,
      of: String
    },
    matchConfidence: {
      type: Number,
      min: 0,
      max: 1,
      description: 'Confidence score for automatic matching'
    },
    matchMethod: {
      type: String,
      enum: ['exact_email', 'exact_id', 'fuzzy_name', 'manual', 'claimed']
    }
  },
  
  // Permissions and Settings
  permissions: {
    canView: {
      type: Boolean,
      default: true
    },
    canParticipate: {
      type: Boolean,
      default: true
    },
    canViewGrades: {
      type: Boolean,
      default: true
    },
    isTeachingAssistant: {
      type: Boolean,
      default: false
    }
  },
  
  // Academic Information
  academicInfo: {
    grade: {
      type: Number,
      min: 0,
      max: 100
    },
    letterGrade: String,
    credits: Number,
    attendanceRate: {
      type: Number,
      min: 0,
      max: 100
    },
    participationScore: {
      type: Number,
      min: 0,
      max: 100
    }
  },
  
  // Statistics
  stats: {
    sessionsAttended: {
      type: Number,
      default: 0
    },
    totalSessions: {
      type: Number,
      default: 0
    },
    attendanceRate: {
      type: Number,
      default: 0,
      description: 'Percentage of sessions attended'
    },
    questionsAnswered: {
      type: Number,
      default: 0
    },
    correctAnswers: {
      type: Number,
      default: 0
    },
    averageResponseTime: {
      type: Number,
      default: 0,
      description: 'In seconds'
    },
    lastAttendanceDate: Date
  },
  
  // Notes and Metadata
  instructorNotes: {
    type: String,
    maxlength: 1000
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Compound index to ensure student can only be enrolled once per class
classEnrollmentSchema.index({ classId: 1, studentId: 1 }, { unique: true });

// Indexes for common queries
classEnrollmentSchema.index({ studentId: 1, status: 1 });
classEnrollmentSchema.index({ classId: 1, status: 1 });
classEnrollmentSchema.index({ 'invitation.token': 1 });
classEnrollmentSchema.index({ enrolledAt: -1 });

// Methods

// Update last activity
classEnrollmentSchema.methods.updateActivity = function() {
  this.lastActivityAt = new Date();
  return this.save();
};

// Drop from class
classEnrollmentSchema.methods.drop = function(reason = 'student_initiated') {
  this.status = 'dropped';
  this.droppedAt = new Date();
  this.metadata.set('dropReason', reason);
  return this.save();
};

// Withdraw (instructor action)
classEnrollmentSchema.methods.withdraw = function(instructorId, reason) {
  this.status = 'withdrawn';
  this.droppedAt = new Date();
  this.metadata.set('withdrawnBy', instructorId);
  this.metadata.set('withdrawReason', reason);
  return this.save();
};

// Generate invitation token
classEnrollmentSchema.methods.generateInvitation = function(sentBy, expiryDays = 30) {
  const crypto = require('crypto');
  
  this.invitation.token = crypto.randomBytes(32).toString('hex');
  this.invitation.sentAt = new Date();
  this.invitation.sentBy = sentBy;
  
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + expiryDays);
  this.invitation.expiresAt = expiryDate;
  
  this.status = 'invited';
  
  return this.save();
};

// Accept invitation
classEnrollmentSchema.methods.acceptInvitation = function() {
  if (this.status !== 'invited') {
    throw new Error('Invalid enrollment status for accepting invitation');
  }
  
  if (this.invitation.expiresAt && new Date() > this.invitation.expiresAt) {
    throw new Error('Invitation has expired');
  }
  
  this.status = 'enrolled';
  this.enrolledAt = new Date();
  this.enrollmentMethod = 'invitation';
  
  // Clear invitation data
  this.invitation = undefined;
  
  return this.save();
};

// Calculate attendance rate
classEnrollmentSchema.methods.calculateAttendanceRate = function() {
  if (this.stats.totalSessions === 0) return 0;
  return Math.round((this.stats.sessionsAttended / this.stats.totalSessions) * 100);
};

// Update session attendance
classEnrollmentSchema.methods.recordAttendance = async function(sessionId) {
  this.stats.sessionsAttended += 1;
  this.stats.lastAttendanceDate = new Date();
  this.lastActivityAt = new Date();
  
  // Update attendance rate
  const Class = mongoose.model('Class');
  const classDoc = await Class.findById(this.classId);
  if (classDoc) {
    this.stats.totalSessions = classDoc.stats.totalSessions;
    this.academicInfo.attendanceRate = this.calculateAttendanceRate();
  }
  
  return this.save();
};

// Virtual for display information
classEnrollmentSchema.virtual('isActive').get(function() {
  return this.status === 'enrolled' || this.status === 'pending';
});

// Statics

// Find enrollment by invitation token
classEnrollmentSchema.statics.findByInvitationToken = function(token) {
  return this.findOne({
    'invitation.token': token,
    'invitation.expiresAt': { $gt: new Date() }
  });
};

// Get enrollment summary for a class
classEnrollmentSchema.statics.getClassSummary = async function(classId) {
  try {
    console.log('Getting enrollment summary for class:', classId);
    
    const summary = await this.aggregate([
      { $match: { classId: new mongoose.Types.ObjectId(classId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
  
  const result = {
    enrolled: 0,
    dropped: 0,
    withdrawn: 0,
    pending: 0,
    invited: 0,
    blocked: 0
  };
  
  console.log('Enrollment aggregation result:', summary);
  
  summary.forEach(item => {
    result[item._id] = item.count;
  });
  
  console.log('Enrollment summary:', result);

  // Calculate average attendance rate from enrolled students
  const attendanceStats = await this.aggregate([
    { $match: {
        classId: new mongoose.Types.ObjectId(classId),
        status: 'enrolled'
      }
    },
    { $group: {
        _id: null,
        avgAttendance: { $avg: '$stats.attendanceRate' },
        avgParticipation: { $avg: '$stats.participationRate' }
      }
    }
  ]);

  const avgAttendance = attendanceStats[0]?.avgAttendance || 0;
  const avgParticipation = attendanceStats[0]?.avgParticipation || 0;

  // Return in the format expected by the route
  return {
    totalEnrolled: result.enrolled,
    activeStudents: result.enrolled,
    avgAttendance: Math.round(avgAttendance),
    avgParticipation: Math.round(avgParticipation),
    ...result
  };
  } catch (error) {
    console.error('Error in getClassSummary:', error);
    // Return default values if there's an error
    return {
      totalEnrolled: 0,
      activeStudents: 0,
      avgAttendance: 0,
      avgParticipation: 0,
      enrolled: 0,
      dropped: 0,
      withdrawn: 0,
      pending: 0,
      invited: 0,
      blocked: 0
    };
  }
};

module.exports = mongoose.model('ClassEnrollment', classEnrollmentSchema);
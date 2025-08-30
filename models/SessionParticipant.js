const mongoose = require('mongoose');

const sessionParticipantSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
    index: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    default: null, // null for anonymous participants
    index: true
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    default: null // for verified mode
  },
  tempId: {
    type: String,
    default: null // for anonymous mode
  },
  displayName: {
    type: String,
    required: true // Either from student profile or anonymous name
  },
  joinedAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  leftAt: {
    type: Date,
    default: null
  },
  device: {
    fingerprint: {
      type: String,
      required: true
    },
    userAgent: {
      type: String,
      required: true
    },
    ip: {
      type: String,
      required: true
    },
    platform: String,
    browser: String
  },
  attendance: {
    present: {
      type: Boolean,
      default: true
    },
    duration: {
      type: Number,
      default: 0 // in seconds
    },
    participation: {
      type: Number,
      default: 0,
      min: 0,
      max: 1 // percentage as decimal
    },
    questionsAnswered: {
      type: Number,
      default: 0
    },
    correctAnswers: {
      type: Number,
      default: 0
    }
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'kicked', 'banned'],
    default: 'active'
  },
  metadata: {
    joinMethod: {
      type: String,
      enum: ['qr', 'code', 'link', 'roster'],
      default: 'code'
    },
    connectionQuality: {
      type: String,
      enum: ['excellent', 'good', 'fair', 'poor'],
      default: 'good'
    },
    lastActivity: {
      type: Date,
      default: Date.now
    }
  }
}, {
  timestamps: true
});

// Indexes for performance
sessionParticipantSchema.index({ sessionId: 1, studentId: 1 }, { unique: true, sparse: true });
sessionParticipantSchema.index({ sessionId: 1, email: 1 }, { unique: true, sparse: true });
sessionParticipantSchema.index({ sessionId: 1, tempId: 1 }, { unique: true, sparse: true });
sessionParticipantSchema.index({ sessionId: 1, 'device.fingerprint': 1 });
sessionParticipantSchema.index({ joinedAt: -1 });

// Virtual for active duration
sessionParticipantSchema.virtual('activeDuration').get(function() {
  if (this.leftAt) {
    return Math.floor((this.leftAt - this.joinedAt) / 1000); // in seconds
  }
  return Math.floor((Date.now() - this.joinedAt) / 1000);
});

// Method to update attendance metrics
sessionParticipantSchema.methods.updateAttendance = function() {
  this.attendance.duration = this.activeDuration;
  this.metadata.lastActivity = new Date();
  
  // Calculate participation rate
  if (this.attendance.questionsAnswered > 0) {
    // Participation is based on answering questions, not just being present
    this.attendance.participation = Math.min(1, this.attendance.questionsAnswered / 10); // Assumes 10 questions is full participation
  }
};

// Method to mark as left
sessionParticipantSchema.methods.markAsLeft = function() {
  this.leftAt = new Date();
  this.status = 'inactive';
  this.updateAttendance();
};

// Method to kick participant
sessionParticipantSchema.methods.kick = function(reason) {
  this.status = 'kicked';
  this.leftAt = new Date();
  this.metadata.kickReason = reason;
  this.updateAttendance();
};

// Static method to find active participants
sessionParticipantSchema.statics.findActive = function(sessionId) {
  return this.find({
    sessionId,
    status: 'active',
    leftAt: null
  });
};

// Static method to get participation statistics
sessionParticipantSchema.statics.getSessionStats = async function(sessionId) {
  const participants = await this.find({ sessionId });
  
  const stats = {
    total: participants.length,
    active: 0,
    anonymous: 0,
    authenticated: 0,
    averageParticipation: 0,
    averageDuration: 0,
    deviceBreakdown: {
      mobile: 0,
      desktop: 0,
      tablet: 0
    }
  };
  
  let totalParticipation = 0;
  let totalDuration = 0;
  
  participants.forEach(p => {
    if (p.status === 'active') stats.active++;
    if (p.studentId) stats.authenticated++;
    else stats.anonymous++;
    
    totalParticipation += p.attendance.participation;
    totalDuration += p.attendance.duration;
    
    // Simple device detection (would be more sophisticated in production)
    const ua = p.device.userAgent.toLowerCase();
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      stats.deviceBreakdown.mobile++;
    } else if (ua.includes('tablet') || ua.includes('ipad')) {
      stats.deviceBreakdown.tablet++;
    } else {
      stats.deviceBreakdown.desktop++;
    }
  });
  
  if (participants.length > 0) {
    stats.averageParticipation = totalParticipation / participants.length;
    stats.averageDuration = totalDuration / participants.length;
  }
  
  return stats;
};

// Static method to clean up stale participants (inactive for more than 5 minutes)
sessionParticipantSchema.statics.cleanupStale = async function(sessionId) {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  
  const result = await this.updateMany(
    {
      sessionId,
      status: 'active',
      'metadata.lastActivity': { $lt: fiveMinutesAgo }
    },
    {
      $set: {
        status: 'inactive',
        leftAt: new Date()
      }
    }
  );
  
  return result.modifiedCount;
};

const SessionParticipant = mongoose.model('SessionParticipant', sessionParticipantSchema);

module.exports = SessionParticipant;
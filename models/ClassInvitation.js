const mongoose = require('mongoose');

const classInvitationSchema = new mongoose.Schema({
  // Class Reference
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true,
    index: true
  },
  
  // Instructor who created invitation
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Invitation Details
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  
  // Student Information (from roster)
  rosterInfo: {
    firstName: String,
    lastName: String,
    fullName: String,
    studentId: String,
    additionalData: {
      type: Map,
      of: String
    }
  },
  
  // Invitation Status
  status: {
    type: String,
    enum: [
      'pending',      // Invitation created but not sent
      'sent',         // Email sent
      'opened',       // Email opened (if tracking enabled)
      'clicked',      // Link clicked
      'accepted',     // Student joined class
      'expired',      // Invitation expired
      'bounced',      // Email bounced
      'error'         // Error sending
    ],
    default: 'pending',
    index: true
  },
  
  // Token System
  token: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  
  // Email Tracking
  emailTracking: {
    sentAt: Date,
    openedAt: Date,
    clickedAt: Date,
    acceptedAt: Date,
    bouncedAt: Date,
    errorMessage: String,
    attempts: {
      type: Number,
      default: 0
    },
    lastAttemptAt: Date
  },
  
  // Linked Enrollment (once accepted)
  enrollmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ClassEnrollment'
  },
  
  // Matched Student (if found)
  matchedStudentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student'
  },
  
  // Source Information
  source: {
    type: String,
    enum: ['manual', 'csv_upload', 'api', 'integration'],
    default: 'manual'
  },
  
  uploadBatchId: {
    type: String,
    description: 'Groups invitations from same CSV upload'
  },
  
  // Notes
  notes: String,
  
  // Metadata
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Indexes
classInvitationSchema.index({ classId: 1, email: 1 });
classInvitationSchema.index({ uploadBatchId: 1 });
classInvitationSchema.index({ status: 1, expiresAt: 1 });

// Generate secure token
classInvitationSchema.methods.generateToken = function() {
  const crypto = require('crypto');
  this.token = crypto.randomBytes(32).toString('hex');
  
  // Set expiry to 30 days by default
  if (!this.expiresAt) {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);
    this.expiresAt = expiry;
  }
  
  return this.token;
};

// Mark as sent
classInvitationSchema.methods.markAsSent = function() {
  this.status = 'sent';
  this.emailTracking.sentAt = new Date();
  this.emailTracking.attempts += 1;
  this.emailTracking.lastAttemptAt = new Date();
  return this.save();
};

// Mark as opened
classInvitationSchema.methods.markAsOpened = function() {
  if (this.status === 'sent') {
    this.status = 'opened';
    this.emailTracking.openedAt = new Date();
  }
  return this.save();
};

// Mark as clicked
classInvitationSchema.methods.markAsClicked = function() {
  if (this.status !== 'accepted') {
    this.status = 'clicked';
    this.emailTracking.clickedAt = new Date();
  }
  return this.save();
};

// Accept invitation
classInvitationSchema.methods.accept = async function(studentId) {
  if (this.status === 'accepted') {
    throw new Error('Invitation already accepted');
  }
  
  if (new Date() > this.expiresAt) {
    this.status = 'expired';
    await this.save();
    throw new Error('Invitation has expired');
  }
  
  this.status = 'accepted';
  this.emailTracking.acceptedAt = new Date();
  this.matchedStudentId = studentId;
  
  return this.save();
};

// Mark as bounced
classInvitationSchema.methods.markAsBounced = function(reason) {
  this.status = 'bounced';
  this.emailTracking.bouncedAt = new Date();
  this.emailTracking.errorMessage = reason;
  return this.save();
};

// Check if invitation is valid
classInvitationSchema.methods.isValid = function() {
  if (this.status === 'accepted') return false;
  if (this.status === 'expired') return false;
  if (new Date() > this.expiresAt) return false;
  return true;
};

// Statics

// Find by token
classInvitationSchema.statics.findByToken = function(token) {
  return this.findOne({ 
    token,
    expiresAt: { $gt: new Date() }
  });
};

// Get batch summary
classInvitationSchema.statics.getBatchSummary = async function(uploadBatchId) {
  const summary = await this.aggregate([
    { $match: { uploadBatchId } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
  
  const result = {
    total: 0,
    pending: 0,
    sent: 0,
    opened: 0,
    clicked: 0,
    accepted: 0,
    expired: 0,
    bounced: 0,
    error: 0
  };
  
  summary.forEach(item => {
    result[item._id] = item.count;
    result.total += item.count;
  });
  
  return result;
};

// Bulk create from roster
classInvitationSchema.statics.createFromRoster = async function(classId, rosterData, createdBy) {
  const crypto = require('crypto');
  const batchId = crypto.randomBytes(16).toString('hex');
  
  const invitations = rosterData.map(student => ({
    classId,
    createdBy,
    email: student.email.toLowerCase().trim(),
    rosterInfo: {
      firstName: student.firstName,
      lastName: student.lastName,
      fullName: student.fullName || `${student.firstName} ${student.lastName}`.trim(),
      studentId: student.studentId,
      additionalData: student.additionalData || {}
    },
    source: 'csv_upload',
    uploadBatchId: batchId,
    token: crypto.randomBytes(32).toString('hex'),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  }));
  
  return this.insertMany(invitations);
};

// Update expired invitations
classInvitationSchema.statics.updateExpiredInvitations = async function() {
  return this.updateMany(
    {
      status: { $in: ['pending', 'sent', 'opened', 'clicked'] },
      expiresAt: { $lt: new Date() }
    },
    {
      $set: { status: 'expired' }
    }
  );
};

module.exports = mongoose.model('ClassInvitation', classInvitationSchema);
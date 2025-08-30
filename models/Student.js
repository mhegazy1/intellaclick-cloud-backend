const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const studentSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
    validate: {
      validator: function(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Invalid email format'
    }
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  profile: {
    firstName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50
    },
    studentId: {
      type: String,
      trim: true,
      sparse: true, // Allows null but ensures uniqueness when provided
      index: true
    },
    institution: {
      type: String,
      trim: true,
      maxlength: 200
    },
    avatar: {
      type: String,
      default: null
    },
    preferredName: {
      type: String,
      trim: true,
      maxlength: 50
    }
  },
  verification: {
    emailVerified: {
      type: Boolean,
      default: false
    },
    verificationToken: {
      type: String,
      select: false // Don't include in queries by default
    },
    verificationExpires: {
      type: Date,
      select: false
    },
    verifiedAt: Date
  },
  passwordReset: {
    resetToken: {
      type: String,
      select: false
    },
    resetExpires: {
      type: Date,
      select: false
    }
  },
  settings: {
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      sessionReminders: {
        type: Boolean,
        default: true
      },
      gradeReleases: {
        type: Boolean,
        default: true
      }
    },
    privacy: {
      showFullName: {
        type: Boolean,
        default: true
      },
      showPerformance: {
        type: Boolean,
        default: false
      }
    },
    accessibility: {
      fontSize: {
        type: String,
        enum: ['small', 'medium', 'large', 'extra-large'],
        default: 'medium'
      },
      highContrast: {
        type: Boolean,
        default: false
      },
      reduceMotion: {
        type: Boolean,
        default: false
      }
    }
  },
  metadata: {
    lastLogin: Date,
    lastLoginIP: String,
    loginCount: {
      type: Number,
      default: 0
    },
    accountStatus: {
      type: String,
      enum: ['active', 'suspended', 'deleted'],
      default: 'active'
    },
    suspensionReason: String,
    deletedAt: Date
  },
  analytics: {
    totalSessions: {
      type: Number,
      default: 0
    },
    totalQuestions: {
      type: Number,
      default: 0
    },
    averageScore: {
      type: Number,
      default: 0
    },
    lastSessionAt: Date
  },
  // OAuth providers for social login
  oauth: {
    google: {
      id: String,
      email: String
    },
    microsoft: {
      id: String,
      email: String
    }
  },
  // GDPR compliance
  consent: {
    termsAccepted: {
      type: Boolean,
      required: true
    },
    termsAcceptedAt: {
      type: Date,
      required: true
    },
    privacyAccepted: {
      type: Boolean,
      required: true
    },
    privacyAcceptedAt: {
      type: Date,
      required: true
    },
    marketingOptIn: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true,
  collection: 'students' // Explicitly set collection name
});

// Indexes for performance
studentSchema.index({ email: 1 });
studentSchema.index({ 'profile.studentId': 1 });
studentSchema.index({ 'profile.institution': 1 });
studentSchema.index({ createdAt: -1 });
studentSchema.index({ 'metadata.accountStatus': 1 });
studentSchema.index({ 'oauth.google.id': 1 });
studentSchema.index({ 'oauth.microsoft.id': 1 });

// Virtual for full name
studentSchema.virtual('fullName').get(function() {
  if (this.profile.preferredName) {
    return this.profile.preferredName;
  }
  return `${this.profile.firstName} ${this.profile.lastName}`;
});

// Virtual for display name (respects privacy settings)
studentSchema.virtual('displayName').get(function() {
  if (!this.settings.privacy.showFullName) {
    return `${this.profile.firstName} ${this.profile.lastName.charAt(0)}.`;
  }
  return this.fullName;
});

// Pre-save middleware to hash password
studentSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();
  
  try {
    // Generate salt and hash password with 12 rounds for extra security
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password for login
studentSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

// Generate email verification token
studentSchema.methods.generateVerificationToken = function() {
  const token = crypto.randomBytes(32).toString('hex');
  this.verification.verificationToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  this.verification.verificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  return token;
};

// Generate password reset token
studentSchema.methods.generatePasswordResetToken = function() {
  const token = crypto.randomBytes(32).toString('hex');
  this.passwordReset.resetToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  this.passwordReset.resetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
  return token;
};

// Verify email
studentSchema.methods.verifyEmail = function() {
  this.verification.emailVerified = true;
  this.verification.verifiedAt = new Date();
  this.verification.verificationToken = undefined;
  this.verification.verificationExpires = undefined;
};

// Update login metadata
studentSchema.methods.updateLoginMetadata = function(ip) {
  this.metadata.lastLogin = new Date();
  this.metadata.lastLoginIP = ip;
  this.metadata.loginCount += 1;
};

// Method to return student object without sensitive data
studentSchema.methods.toJSON = function() {
  const student = this.toObject();
  delete student.password;
  delete student.verification.verificationToken;
  delete student.verification.verificationExpires;
  delete student.passwordReset;
  delete student.__v;
  
  // Include virtuals
  student.fullName = this.fullName;
  student.displayName = this.displayName;
  
  return student;
};

// Method for GDPR data export
studentSchema.methods.exportData = function() {
  const data = this.toObject();
  delete data.password;
  delete data.verification.verificationToken;
  delete data.passwordReset;
  return data;
};

// Soft delete method
studentSchema.methods.softDelete = function() {
  this.metadata.accountStatus = 'deleted';
  this.metadata.deletedAt = new Date();
  // Anonymize email to maintain uniqueness constraint
  this.email = `deleted_${this._id}@deleted.com`;
  return this.save();
};

// Static method to find active students only
studentSchema.statics.findActive = function(filter = {}) {
  return this.find({ ...filter, 'metadata.accountStatus': 'active' });
};

// Static method to clean up unverified accounts older than 7 days
studentSchema.statics.cleanupUnverified = async function() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return this.deleteMany({
    'verification.emailVerified': false,
    createdAt: { $lt: sevenDaysAgo }
  });
};

const Student = mongoose.model('Student', studentSchema);

module.exports = Student;
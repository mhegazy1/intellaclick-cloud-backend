const mongoose = require('mongoose');

const taPermissionsSchema = new mongoose.Schema({
  // Core relationship
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true,
    index: true
  },
  taUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  grantedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    description: 'Instructor who granted these permissions'
  },
  
  // Session Permissions
  sessionPermissions: {
    canCreateSessions: {
      type: Boolean,
      default: true,
      description: 'Can create live clicker sessions'
    },
    canEndSessions: {
      type: Boolean,
      default: true,
      description: 'Can end active sessions'
    },
    canViewSessionResults: {
      type: Boolean,
      default: true,
      description: 'Can view session results and analytics'
    },
    canExportSessionData: {
      type: Boolean,
      default: false,
      description: 'Can export session data to CSV/PDF'
    }
  },
  
  // Question Management
  questionPermissions: {
    canViewQuestions: {
      type: Boolean,
      default: true,
      description: 'Can view existing questions'
    },
    canCreateQuestions: {
      type: Boolean,
      default: false,
      description: 'Can create new questions'
    },
    canEditQuestions: {
      type: Boolean,
      default: false,
      description: 'Can modify existing questions'
    },
    canDeleteQuestions: {
      type: Boolean,
      default: false,
      description: 'Can delete questions'
    }
  },
  
  // Student Management
  studentPermissions: {
    canViewRoster: {
      type: Boolean,
      default: true,
      description: 'Can view class roster'
    },
    canViewStudentScores: {
      type: Boolean,
      default: true,
      description: 'Can view individual student scores'
    },
    canModifyGrades: {
      type: Boolean,
      default: false,
      description: 'Can modify student grades'
    },
    canAddStudents: {
      type: Boolean,
      default: false,
      description: 'Can add students to class'
    },
    canRemoveStudents: {
      type: Boolean,
      default: false,
      description: 'Can remove students from class'
    },
    canViewStudentContact: {
      type: Boolean,
      default: false,
      description: 'Can view student email/contact info'
    }
  },
  
  // Analytics & Reports
  analyticsPermissions: {
    canViewClassAnalytics: {
      type: Boolean,
      default: true,
      description: 'Can view overall class performance'
    },
    canViewIndividualAnalytics: {
      type: Boolean,
      default: false,
      description: 'Can view detailed individual student analytics'
    },
    canGenerateReports: {
      type: Boolean,
      default: false,
      description: 'Can generate class reports'
    },
    canViewGamificationData: {
      type: Boolean,
      default: true,
      description: 'Can view leaderboards and achievements'
    }
  },
  
  // Content Management
  contentPermissions: {
    canViewQuizzes: {
      type: Boolean,
      default: true,
      description: 'Can view existing quizzes'
    },
    canCreateQuizzes: {
      type: Boolean,
      default: false,
      description: 'Can create new quizzes'
    },
    canEditQuizzes: {
      type: Boolean,
      default: false,
      description: 'Can modify existing quizzes'
    },
    canScheduleQuizzes: {
      type: Boolean,
      default: false,
      description: 'Can schedule quizzes for future'
    }
  },
  
  // Administrative
  adminPermissions: {
    canModifyClassSettings: {
      type: Boolean,
      default: false,
      description: 'Can change class name, term, etc.'
    },
    canManageOtherTAs: {
      type: Boolean,
      default: false,
      description: 'Can add/remove other TAs'
    },
    canViewAuditLog: {
      type: Boolean,
      default: false,
      description: 'Can view who did what in the class'
    }
  },
  
  // Time restrictions (optional)
  timeRestrictions: {
    startDate: {
      type: Date,
      description: 'When TA permissions become active'
    },
    endDate: {
      type: Date,
      description: 'When TA permissions expire'
    },
    allowedDays: [{
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    }],
    allowedHours: {
      start: {
        type: Number,
        min: 0,
        max: 23,
        description: 'Hour of day when access starts (24-hour format)'
      },
      end: {
        type: Number,
        min: 0,
        max: 23,
        description: 'Hour of day when access ends (24-hour format)'
      }
    }
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  notes: {
    type: String,
    maxlength: 500,
    description: 'Any notes about this TA assignment'
  },
  
  // Audit trail
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lastAccessedAt: Date
});

// Compound index for unique TA per class
taPermissionsSchema.index({ classId: 1, taUserId: 1 }, { unique: true });

// Method to check if permission is currently valid
taPermissionsSchema.methods.isCurrentlyValid = function() {
  if (!this.isActive) return false;
  
  const now = new Date();
  
  // Check date restrictions
  if (this.timeRestrictions.startDate && now < this.timeRestrictions.startDate) return false;
  if (this.timeRestrictions.endDate && now > this.timeRestrictions.endDate) return false;
  
  // Check day restrictions
  if (this.timeRestrictions.allowedDays && this.timeRestrictions.allowedDays.length > 0) {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDay = dayNames[now.getDay()];
    if (!this.timeRestrictions.allowedDays.includes(currentDay)) return false;
  }
  
  // Check hour restrictions
  if (this.timeRestrictions.allowedHours && 
      this.timeRestrictions.allowedHours.start !== undefined && 
      this.timeRestrictions.allowedHours.end !== undefined) {
    const currentHour = now.getHours();
    const start = this.timeRestrictions.allowedHours.start;
    const end = this.timeRestrictions.allowedHours.end;
    
    // Handle cases where end time is next day (e.g., 20:00 to 02:00)
    if (start <= end) {
      if (currentHour < start || currentHour >= end) return false;
    } else {
      if (currentHour < start && currentHour >= end) return false;
    }
  }
  
  return true;
};

// Method to check specific permission
taPermissionsSchema.methods.hasPermission = function(category, permission) {
  if (!this.isCurrentlyValid()) return false;
  
  const categoryPerms = this[`${category}Permissions`];
  if (!categoryPerms) return false;
  
  return categoryPerms[permission] === true;
};

// Update lastAccessedAt
taPermissionsSchema.methods.recordAccess = async function() {
  this.lastAccessedAt = new Date();
  await this.save();
};

// Pre-save middleware
taPermissionsSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Static method to get all permissions for a TA in a class
taPermissionsSchema.statics.getPermissionsFor = async function(taUserId, classId) {
  const permissions = await this.findOne({ taUserId, classId, isActive: true });
  if (!permissions || !permissions.isCurrentlyValid()) {
    return null;
  }
  await permissions.recordAccess();
  return permissions;
};

module.exports = mongoose.model('TAPermissions', taPermissionsSchema);
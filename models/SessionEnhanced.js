const mongoose = require('mongoose');

const sessionEnhancedSchema = new mongoose.Schema({
  sessionCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    match: /^[A-Z0-9]{6}$/
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    default: '',
    maxlength: 1000
  },
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
  // Class association
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    index: true
  },
  // Authentication configuration
  authMode: {
    type: String,
    enum: ['open', 'verified', 'secure'],
    default: 'open',
    required: true
  },
  authSettings: {
    allowLateJoin: {
      type: Boolean,
      default: true
    },
    requireRoster: {
      type: Boolean,
      default: false
    },
    rosterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Roster'
    },
    maxParticipants: {
      type: Number,
      default: 500
    },
    allowGuestMode: {
      type: Boolean,
      default: true // Even in secure mode, allow guest access if instructor permits
    }
  },
  // Session settings
  settings: {
    questionTimer: {
      type: Number,
      default: 60 // seconds per question, 0 for no timer
    },
    showResultsAfter: {
      type: String,
      enum: ['each_question', 'session_end', 'manual', 'never'],
      default: 'each_question'
    },
    allowRetakes: {
      type: Boolean,
      default: false
    },
    lockAfterSubmission: {
      type: Boolean,
      default: true
    },
    randomizeQuestions: {
      type: Boolean,
      default: false
    },
    randomizeOptions: {
      type: Boolean,
      default: false
    },
    enableChat: {
      type: Boolean,
      default: false
    },
    recordSession: {
      type: Boolean,
      default: false
    }
  },
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'waiting', 'active', 'paused', 'ended', 'archived'],
    default: 'waiting',
    index: true
  },
  scheduledFor: {
    type: Date,
    default: null
  },
  currentQuestion: {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question'
    },
    questionIndex: Number,
    questionText: String,
    questionType: String,
    options: [String],
    correctAnswer: mongoose.Schema.Types.Mixed,
    points: {
      type: Number,
      default: 1
    },
    startedAt: Date,
    endsAt: Date, // For timed questions
    status: {
      type: String,
      enum: ['active', 'reviewing', 'closed'],
      default: 'active'
    }
  },
  questions: [{
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question'
    },
    order: Number,
    points: {
      type: Number,
      default: 1
    },
    timeLimit: Number, // Override session default
    asked: {
      type: Boolean,
      default: false
    },
    askedAt: Date,
    stats: {
      totalResponses: {
        type: Number,
        default: 0
      },
      correctResponses: {
        type: Number,
        default: 0
      },
      averageTime: {
        type: Number,
        default: 0
      }
    }
  }],
  // Participant tracking moved to SessionParticipant model
  participantCount: {
    type: Number,
    default: 0
  },
  // Response tracking enhanced
  totalResponses: {
    type: Number,
    default: 0
  },
  // Session metadata
  metadata: {
    source: {
      type: String,
      enum: ['desktop', 'web', 'api', 'lms'],
      default: 'desktop'
    },
    platform: {
      type: String,
      enum: ['powerpoint', 'standalone', 'integrated'],
      default: 'standalone'
    },
    tags: [String],
    course: {
      code: String,
      name: String,
      section: String,
      term: String
    }
  },
  // Analytics summary (updated in real-time)
  analytics: {
    peakParticipants: {
      type: Number,
      default: 0
    },
    averageScore: {
      type: Number,
      default: 0
    },
    engagementRate: {
      type: Number,
      default: 0
    },
    completionRate: {
      type: Number,
      default: 0
    }
  },
  // Timestamps
  startedAt: Date,
  endedAt: Date,
  pausedAt: Date,
  resumedAt: Date
}, {
  timestamps: true
});

// Generate unique session code
sessionEnhancedSchema.statics.generateUniqueCode = async function() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  let isUnique = false;
  
  while (!isUnique) {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    // Check if code already exists
    const existing = await this.findOne({ sessionCode: code });
    if (!existing) {
      isUnique = true;
    }
  }
  
  return code;
};

// Method to start session
sessionEnhancedSchema.methods.start = function() {
  this.status = 'active';
  this.startedAt = new Date();
  return this.save();
};

// Method to end session
sessionEnhancedSchema.methods.end = function() {
  this.status = 'ended';
  this.endedAt = new Date();
  return this.save();
};

// Method to pause session
sessionEnhancedSchema.methods.pause = function() {
  this.status = 'paused';
  this.pausedAt = new Date();
  return this.save();
};

// Method to resume session
sessionEnhancedSchema.methods.resume = function() {
  this.status = 'active';
  this.resumedAt = new Date();
  return this.save();
};

// Method to add question
sessionEnhancedSchema.methods.addQuestion = function(questionData) {
  const order = this.questions.length;
  this.questions.push({
    ...questionData,
    order
  });
  return this.save();
};

// Method to activate question
sessionEnhancedSchema.methods.activateQuestion = async function(questionIndex) {
  if (questionIndex >= this.questions.length) {
    throw new Error('Question index out of bounds');
  }
  
  const question = this.questions[questionIndex];
  
  // Mark previous question as closed if any
  if (this.currentQuestion.questionId) {
    this.currentQuestion.status = 'closed';
  }
  
  // Set new current question
  this.currentQuestion = {
    questionId: question.questionId,
    questionIndex: questionIndex,
    startedAt: new Date(),
    status: 'active'
  };
  
  // Set end time if timer is enabled
  if (question.timeLimit || this.settings.questionTimer) {
    const timeLimit = question.timeLimit || this.settings.questionTimer;
    this.currentQuestion.endsAt = new Date(Date.now() + timeLimit * 1000);
  }
  
  // Mark question as asked
  question.asked = true;
  question.askedAt = new Date();
  
  return this.save();
};

// Method to close current question
sessionEnhancedSchema.methods.closeCurrentQuestion = function() {
  if (this.currentQuestion.questionId) {
    this.currentQuestion.status = 'closed';
  }
  return this.save();
};

// Virtual for duration
sessionEnhancedSchema.virtual('duration').get(function() {
  if (this.startedAt && this.endedAt) {
    return Math.floor((this.endedAt - this.startedAt) / 1000); // in seconds
  }
  if (this.startedAt) {
    return Math.floor((Date.now() - this.startedAt) / 1000);
  }
  return 0;
});

// Virtual for is live
sessionEnhancedSchema.virtual('isLive').get(function() {
  return this.status === 'active' || this.status === 'paused';
});

// Indexes for performance
sessionEnhancedSchema.index({ sessionCode: 1 });
sessionEnhancedSchema.index({ instructorId: 1, status: 1 });
sessionEnhancedSchema.index({ scheduledFor: 1 });
sessionEnhancedSchema.index({ createdAt: -1 });
sessionEnhancedSchema.index({ 'metadata.course.code': 1 });
sessionEnhancedSchema.index({ 'metadata.tags': 1 });

// Export both the enhanced model and the original for backward compatibility
const SessionEnhanced = mongoose.model('SessionEnhanced', sessionEnhancedSchema);

module.exports = SessionEnhanced;
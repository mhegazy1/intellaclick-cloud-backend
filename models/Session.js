const mongoose = require('mongoose');
const ensureRequireLoginPlugin = require('./plugins/ensureRequireLogin');

const sessionSchema = new mongoose.Schema({
  sessionCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  title: {
    type: String,
    required: true
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
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: false,
    index: true,
    description: 'Optional link to a class for enrollment-based sessions'
  },
  status: {
    type: String,
    enum: ['waiting', 'active', 'ended'],
    default: 'waiting'
  },
  requireLogin: {
    type: Boolean,
    default: false,
    required: false,
    description: 'Whether students must be logged in to join this session'
  },
  restrictToEnrolled: {
    type: Boolean,
    default: true,
    required: false,
    description: 'Whether only enrolled students can join this session'
  },
  currentQuestion: {
    questionId: String,
    questionText: String,
    questionType: String,
    options: [String],
    correctAnswer: String,
    points: { type: Number, default: 10 },
    timeLimit: { type: Number, default: 30 },
    startedAt: Date
  },
  participants: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    participantId: String,
    deviceId: String,
    name: String,
    joinedAt: {
      type: Date,
      default: Date.now
    },
    lastJoinedAt: {
      type: Date,
      default: Date.now
    },
    isEnrolled: { type: Boolean, default: false }
  }],
  responses: [{
    questionId: String,
    participantId: String,
    userId: mongoose.Schema.Types.ObjectId,
    answer: mongoose.Schema.Types.Mixed,
    submittedAt: {
      type: Date,
      default: Date.now
    }
  }],
  questionsSent: [{
    questionId: String,
    questionText: String,
    sentAt: {
      type: Date,
      default: Date.now
    }
  }],
  totalQuestions: {
    type: Number,
    default: 0
  },
  startedAt: Date,
  endedAt: Date,
  metadata: {
    platform: { type: String, enum: ['powerpoint', 'standalone', 'web'], default: 'web' },
    className: String,
    classCode: String
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

// Update timestamp on save and ensure requireLogin is set
sessionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Ensure requireLogin is set (handle undefined/null cases)
  if (this.requireLogin === undefined || this.requireLogin === null) {
    this.requireLogin = false;
  }
  
  // Log for debugging
  if (this.isNew || this.isModified('requireLogin')) {
    console.log('[Session Model] Pre-save - requireLogin:', this.requireLogin, 'type:', typeof this.requireLogin);
  }
  
  next();
});

// Post-save hook to verify requireLogin was saved
sessionSchema.post('save', async function(doc) {
  if (doc.isNew || doc.wasNew) {
    console.log('[Session Model] Post-save - Session created with:', {
      id: doc._id,
      sessionCode: doc.sessionCode,
      requireLogin: doc.requireLogin,
      requireLoginType: typeof doc.requireLogin
    });
    
    // Verify the field exists in the database
    const Session = mongoose.model('Session');
    const verifySession = await Session.findById(doc._id).select('sessionCode requireLogin');
    console.log('[Session Model] Post-save verification:', {
      sessionCode: verifySession.sessionCode,
      requireLogin: verifySession.requireLogin,
      requireLoginExists: 'requireLogin' in verifySession.toObject()
    });
  }
});

// Apply the ensure requireLogin plugin
sessionSchema.plugin(ensureRequireLoginPlugin);

// Indexes for performance and uniqueness
sessionSchema.index({ sessionCode: 1 }, { unique: true });
sessionSchema.index({ instructorId: 1 });
sessionSchema.index({ status: 1 });

// Add a static method to ensure requireLogin field in queries
sessionSchema.statics.findOneWithRequireLogin = async function(query) {
  const session = await this.findOne(query);
  if (session && (session.requireLogin === undefined || session.requireLogin === null)) {
    session.requireLogin = false;
  }
  return session;
};

module.exports = mongoose.model('Session', sessionSchema);
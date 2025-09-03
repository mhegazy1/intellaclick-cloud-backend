const mongoose = require('mongoose');

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
  status: {
    type: String,
    enum: ['waiting', 'active', 'ended'],
    default: 'waiting'
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
    }
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
sessionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for performance and uniqueness
sessionSchema.index({ sessionCode: 1 }, { unique: true });
sessionSchema.index({ instructorId: 1 });
sessionSchema.index({ status: 1 });

module.exports = mongoose.model('Session', sessionSchema);
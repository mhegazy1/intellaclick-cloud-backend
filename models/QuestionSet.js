const mongoose = require('mongoose');

const questionSetSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  instructorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    default: null
  },
  questions: [{
    text: String,
    questionText: String,
    type: {
      type: String,
      enum: ['mcq', 'tf', 'matching', 'ordering', 'fillblank']
    },
    // MCQ/TF fields
    options: [String],
    optionTexts: [String],
    correctAnswer: mongoose.Schema.Types.Mixed,
    // Matching fields
    pairs: [{
      left: String,
      right: String
    }],
    leftColumn: [String],
    rightColumn: [String],
    // Ordering fields
    items: [String],
    correctOrder: [String],
    // Common fields
    points: {
      type: Number,
      default: 10
    },
    timeLimit: {
      type: Number,
      default: 30
    }
  }],
  questionCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Update questionCount before saving
questionSetSchema.pre('save', function(next) {
  this.questionCount = this.questions ? this.questions.length : 0;
  next();
});

// Index for faster queries
questionSetSchema.index({ instructorId: 1, createdAt: -1 });

module.exports = mongoose.model('QuestionSet', questionSetSchema);

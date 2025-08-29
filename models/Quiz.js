const mongoose = require('mongoose');

const quizSchema = new mongoose.Schema({
  // Sync fields
  syncId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  syncVersion: {
    type: Number,
    default: 0
  },
  lastSyncedAt: {
    type: Date,
    default: Date.now
  },
  deleted: {
    type: Boolean,
    default: false
  },
  
  // User ownership
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Quiz metadata
  title: {
    type: String,
    required: true
  },
  description: String,
  category: String,
  categoryId: String,
  
  // Quiz settings
  settings: {
    shuffleQuestions: {
      type: Boolean,
      default: false
    },
    shuffleOptions: {
      type: Boolean,
      default: false
    },
    showResults: {
      type: Boolean,
      default: true
    },
    showCorrectAnswers: {
      type: Boolean,
      default: true
    },
    allowReview: {
      type: Boolean,
      default: true
    },
    timeLimit: Number,
    passingScore: {
      type: Number,
      default: 70
    },
    attemptsAllowed: {
      type: Number,
      default: -1 // -1 means unlimited
    }
  },
  
  // Questions
  questions: [{
    questionId: String,
    syncId: String,
    order: Number,
    points: Number,
    // Store question snapshot for consistency
    questionSnapshot: {
      questionText: String,
      type: String,
      options: [String],
      correctAnswer: mongoose.Schema.Types.Mixed,
      explanation: String
    }
  }],
  
  // Sections (for sectioned quizzes)
  sections: [{
    id: String,
    name: String,
    description: String,
    weight: {
      type: Number,
      default: 1
    },
    timeLimit: Number,
    questions: [{
      questionId: String,
      order: Number,
      points: Number
    }]
  }],
  
  // Quiz type
  type: {
    type: String,
    enum: ['standard', 'sectioned', 'adaptive', 'practice'],
    default: 'standard'
  },
  
  // Templates
  isTemplate: {
    type: Boolean,
    default: false
  },
  templateName: String,
  
  // Statistics
  totalPoints: {
    type: Number,
    default: 0
  },
  questionCount: {
    type: Number,
    default: 0
  },
  
  // Publishing
  isPublished: {
    type: Boolean,
    default: false
  },
  publishedAt: Date,
  
  // Version tracking
  version: {
    type: Number,
    default: 1
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp and calculate totals on save
quizSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  if (this.isNew && !this.syncId) {
    // Generate syncId if not provided
    this.syncId = new mongoose.Types.ObjectId().toString();
  }
  
  // Calculate total points and question count
  if (this.type === 'sectioned' && this.sections?.length > 0) {
    this.questionCount = 0;
    this.totalPoints = 0;
    
    this.sections.forEach(section => {
      this.questionCount += section.questions?.length || 0;
      section.questions?.forEach(q => {
        this.totalPoints += q.points || 1;
      });
    });
  } else if (this.questions?.length > 0) {
    this.questionCount = this.questions.length;
    this.totalPoints = this.questions.reduce((sum, q) => sum + (q.points || 1), 0);
  }
  
  next();
});

// Indexes for performance
quizSchema.index({ syncId: 1, userId: 1 });
quizSchema.index({ categoryId: 1 });
quizSchema.index({ deleted: 1 });
quizSchema.index({ isPublished: 1 });
quizSchema.index({ createdAt: -1 });
quizSchema.index({ 'questions.questionId': 1 });

// Populate question details
quizSchema.methods.populateQuestions = async function() {
  const Question = mongoose.model('Question');
  
  if (this.type === 'sectioned' && this.sections?.length > 0) {
    for (const section of this.sections) {
      for (const q of section.questions || []) {
        const question = await Question.findOne({ 
          syncId: q.questionId,
          deleted: false 
        });
        if (question) {
          q.questionDetails = question.toObject();
        }
      }
    }
  } else {
    for (const q of this.questions || []) {
      const question = await Question.findOne({ 
        syncId: q.questionId || q.syncId,
        deleted: false 
      });
      if (question) {
        q.questionDetails = question.toObject();
      }
    }
  }
  
  return this;
};

// Soft delete method
quizSchema.methods.softDelete = function() {
  this.deleted = true;
  this.syncVersion = (this.syncVersion || 0) + 1;
  return this.save();
};

// Restore method
quizSchema.methods.restore = function() {
  this.deleted = false;
  this.syncVersion = (this.syncVersion || 0) + 1;
  return this.save();
};

// Duplicate quiz
quizSchema.methods.duplicate = async function(newUserId) {
  const newQuiz = new this.constructor({
    ...this.toObject(),
    _id: new mongoose.Types.ObjectId(),
    syncId: new mongoose.Types.ObjectId().toString(),
    userId: newUserId || this.userId,
    title: `${this.title} (Copy)`,
    isPublished: false,
    publishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    syncVersion: 0
  });
  
  return newQuiz.save();
};

module.exports = mongoose.model('Quiz', quizSchema);
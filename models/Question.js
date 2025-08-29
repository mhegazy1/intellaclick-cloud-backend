const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
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
  
  // Question content
  questionText: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['multiple_choice', 'multiple-choice', 'true_false', 'true-false', 'fill_blank', 'multiple_answer', 'matching', 'essay']
  },
  
  // Category information
  category: String,
  categoryId: String,
  fullCategoryPath: String,
  
  // Question data based on type
  options: [String],
  correctAnswer: mongoose.Schema.Types.Mixed,
  points: {
    type: Number,
    default: 1
  },
  explanation: String,
  
  // Multi-part questions
  multiPart: Boolean,
  parts: [{
    partNumber: Number,
    type: String,
    questionText: String,
    options: [String],
    correctAnswer: mongoose.Schema.Types.Mixed,
    points: Number,
    explanation: String
  }],
  
  // Rich text and media
  isRichText: Boolean,
  hasImages: Boolean,
  
  // Additional fields
  tags: [String],
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard']
  },
  timeLimit: Number,
  
  // Import tracking
  importSource: String,
  sourceQuestionId: String,
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  // Version tracking
  version: {
    type: Number,
    default: 1
  },
  isVariant: Boolean,
  parentId: String,
  variantGroup: String,
  
  // Fill-in-blank specific
  blanks: [{
    index: Number,
    correctAnswers: [String],
    blankType: String,
    blankSize: String
  }],
  
  // Matching specific  
  matchingPairs: [{
    left: String,
    right: String
  }],
  
  // Lock status
  locked: Boolean,
  lockedBy: String,
  lockedAt: Date
});

// Update timestamp on save
questionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  if (this.isNew && !this.syncId) {
    // Generate syncId if not provided
    this.syncId = new mongoose.Types.ObjectId().toString();
  }
  next();
});

// Indexes for performance
questionSchema.index({ syncId: 1, userId: 1 });
questionSchema.index({ categoryId: 1 });
questionSchema.index({ deleted: 1 });
questionSchema.index({ createdAt: -1 });
questionSchema.index({ 'parts.type': 1 });

// Soft delete method
questionSchema.methods.softDelete = function() {
  this.deleted = true;
  this.syncVersion = (this.syncVersion || 0) + 1;
  return this.save();
};

// Restore method
questionSchema.methods.restore = function() {
  this.deleted = false;
  this.syncVersion = (this.syncVersion || 0) + 1;
  return this.save();
};

module.exports = mongoose.model('Question', questionSchema);
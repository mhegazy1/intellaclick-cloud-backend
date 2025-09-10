const mongoose = require('mongoose');

const achievementSchema = new mongoose.Schema({
  // Basic Information
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    description: 'Unique identifier like FIRST_QUIZ, PERFECT_SCORE, etc.'
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: [
      'participation',    // Joining sessions, answering questions
      'performance',      // High scores, streaks
      'consistency',      // Regular attendance, completion
      'speed',           // Fast responses
      'social',          // Helping others, top of class
      'milestone',       // 10th quiz, 100 questions answered
      'special'          // Event-based, seasonal
    ],
    required: true
  },
  
  // Visual Elements
  icon: {
    type: String,
    default: '🏆',
    description: 'Emoji or icon identifier'
  },
  color: {
    type: String,
    default: '#FFD700',
    description: 'Hex color for badge display'
  },
  rarity: {
    type: String,
    enum: ['common', 'uncommon', 'rare', 'epic', 'legendary'],
    default: 'common'
  },
  
  // Requirements
  criteria: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    description: 'JSON object defining achievement criteria'
    // Examples:
    // { type: 'quiz_count', value: 10 }
    // { type: 'perfect_scores', value: 5 }
    // { type: 'attendance_streak', value: 7 }
    // { type: 'response_speed', value: 3, timeLimit: 5000 }
  },
  
  // Rewards
  points: {
    type: Number,
    default: 10,
    min: 0
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  isHidden: {
    type: Boolean,
    default: false,
    description: 'Hidden achievements are not shown until earned'
  },
  
  // Tracking
  totalAwarded: {
    type: Number,
    default: 0,
    description: 'Total number of times this achievement has been awarded'
  },
  firstAwardedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    description: 'First user to earn this achievement'
  },
  firstAwardedAt: Date,
  
  // Metadata
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for performance
achievementSchema.index({ code: 1 });
achievementSchema.index({ category: 1, isActive: 1 });
achievementSchema.index({ rarity: 1 });

// Update timestamp on save
achievementSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Static method to check if criteria is met
achievementSchema.statics.checkCriteria = function(criteria, userData) {
  switch (criteria.type) {
    case 'quiz_count':
      return userData.quizzesTaken >= criteria.value;
      
    case 'perfect_scores':
      return userData.perfectScores >= criteria.value;
      
    case 'attendance_streak':
      return userData.currentStreak >= criteria.value;
      
    case 'response_speed':
      return userData.fastResponses >= criteria.value;
      
    case 'total_points':
      return userData.totalPoints >= criteria.value;
      
    case 'questions_answered':
      return userData.questionsAnswered >= criteria.value;
      
    case 'accuracy_percentage':
      return userData.accuracy >= criteria.value;
      
    default:
      return false;
  }
};

module.exports = mongoose.model('Achievement', achievementSchema);
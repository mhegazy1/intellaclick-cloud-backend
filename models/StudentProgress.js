const mongoose = require('mongoose');

const studentProgressSchema = new mongoose.Schema({
  // Core Relationships
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true,
    index: true
  },
  
  // Gamification Stats
  level: {
    type: Number,
    default: 1,
    min: 1
  },
  experience: {
    type: Number,
    default: 0,
    min: 0,
    description: 'Total XP earned in this class'
  },
  experienceToNextLevel: {
    type: Number,
    default: 100,
    description: 'XP required for next level'
  },
  
  // Points and Currency
  totalPoints: {
    type: Number,
    default: 0,
    min: 0,
    description: 'Total points earned from all activities'
  },
  currentPoints: {
    type: Number,
    default: 0,
    min: 0,
    description: 'Spendable points (if implementing a shop system)'
  },
  
  // Performance Metrics
  quizzesTaken: {
    type: Number,
    default: 0
  },
  questionsAnswered: {
    type: Number,
    default: 0
  },
  correctAnswers: {
    type: Number,
    default: 0
  },
  perfectScores: {
    type: Number,
    default: 0,
    description: 'Number of quizzes with 100% score'
  },
  averageScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  bestScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  
  // Speed Metrics
  averageResponseTime: {
    type: Number,
    default: 0,
    description: 'Average time to answer in milliseconds'
  },
  fastResponses: {
    type: Number,
    default: 0,
    description: 'Responses within 5 seconds'
  },
  
  // Streaks and Consistency
  currentStreak: {
    type: Number,
    default: 0,
    description: 'Current attendance streak in days'
  },
  longestStreak: {
    type: Number,
    default: 0,
    description: 'Longest attendance streak ever'
  },
  lastActivityDate: Date,
  
  // Rankings (updated periodically)
  classRank: {
    type: Number,
    default: 0,
    description: 'Rank within the class'
  },
  previousClassRank: {
    type: Number,
    default: 0,
    description: 'Previous rank for comparison'
  },
  
  // Achievements
  achievements: [{
    achievementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Achievement',
      required: true
    },
    earnedAt: {
      type: Date,
      default: Date.now
    },
    progress: {
      type: Number,
      default: 100,
      description: 'Progress percentage for progressive achievements'
    }
  }],
  
  // Badges (simpler than achievements)
  badges: [{
    code: String,
    name: String,
    icon: String,
    earnedAt: Date
  }],
  
  // Weekly/Monthly Stats (for leaderboards)
  weeklyStats: {
    points: { type: Number, default: 0 },
    quizzesTaken: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 },
    weekStart: Date
  },
  monthlyStats: {
    points: { type: Number, default: 0 },
    quizzesTaken: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 },
    monthStart: Date
  },
  
  // Milestones
  milestones: {
    firstQuiz: Date,
    firstPerfectScore: Date,
    tenthQuiz: Date,
    hundredthQuestion: Date,
    firstBadge: Date,
    levelTen: Date
  },
  
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

// Compound index for unique student-class combination
studentProgressSchema.index({ studentId: 1, classId: 1 }, { unique: true });

// Indexes for leaderboard queries
studentProgressSchema.index({ classId: 1, totalPoints: -1 });
studentProgressSchema.index({ classId: 1, level: -1 });
studentProgressSchema.index({ classId: 1, 'weeklyStats.points': -1 });

// Calculate level from experience
studentProgressSchema.methods.calculateLevel = function() {
  // Simple leveling formula: each level requires 100 * level XP
  let level = 1;
  let totalRequired = 0;
  
  while (totalRequired <= this.experience) {
    level++;
    totalRequired += 100 * level;
  }
  
  this.level = level - 1;
  this.experienceToNextLevel = (100 * level) - (this.experience - (totalRequired - 100 * level));
  return this.level;
};

// Add experience and check for level up
studentProgressSchema.methods.addExperience = function(amount) {
  this.experience += amount;
  const oldLevel = this.level;
  const newLevel = this.calculateLevel();
  
  return {
    leveledUp: newLevel > oldLevel,
    oldLevel,
    newLevel,
    experience: this.experience,
    experienceToNextLevel: this.experienceToNextLevel
  };
};

// Update streak
studentProgressSchema.methods.updateStreak = function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (!this.lastActivityDate) {
    this.currentStreak = 1;
    this.lastActivityDate = today;
  } else {
    const lastActivity = new Date(this.lastActivityDate);
    lastActivity.setHours(0, 0, 0, 0);
    
    const daysDiff = Math.floor((today - lastActivity) / (1000 * 60 * 60 * 24));
    
    if (daysDiff === 0) {
      // Already active today, no change
    } else if (daysDiff === 1) {
      // Consecutive day, increment streak
      this.currentStreak++;
    } else {
      // Streak broken, reset
      this.currentStreak = 1;
    }
    
    this.lastActivityDate = today;
  }
  
  // Update longest streak
  if (this.currentStreak > this.longestStreak) {
    this.longestStreak = this.currentStreak;
  }
  
  return this.currentStreak;
};

// Update timestamp on save
studentProgressSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Initialize weekly/monthly stats if needed
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  
  if (!this.weeklyStats.weekStart || this.weeklyStats.weekStart < weekStart) {
    this.weeklyStats = {
      points: 0,
      quizzesTaken: 0,
      accuracy: 0,
      weekStart
    };
  }
  
  if (!this.monthlyStats.monthStart || this.monthlyStats.monthStart < monthStart) {
    this.monthlyStats = {
      points: 0,
      quizzesTaken: 0,
      accuracy: 0,
      monthStart
    };
  }
  
  next();
});

module.exports = mongoose.model('StudentProgress', studentProgressSchema);
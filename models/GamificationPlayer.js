/**
 * Gamification Player Model
 * Stores student gamification data (points, level, achievements, etc.)
 */

const mongoose = require('mongoose');

const GamificationPlayerSchema = new mongoose.Schema({
  // Player identification
  playerId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    index: true
  },
  name: {
    type: String,
    required: true
  },
  avatar: {
    type: String,
    default: '🎮'
  },

  // Class/Roster association
  rosterId: {
    type: String,
    index: true
  },
  instructorId: {
    type: String,
    index: true
  },
  classId: {
    type: String,
    index: true
  },

  // Current stats
  level: {
    type: Number,
    default: 1
  },
  experience: {
    type: Number,
    default: 0
  },
  totalPoints: {
    type: Number,
    default: 0,
    index: true
  },
  coins: {
    type: Number,
    default: 0
  },

  // Collections
  badges: [{
    id: String,
    name: String,
    description: String,
    icon: String,
    earnedAt: Date
  }],
  achievements: [{
    id: String,
    name: String,
    description: String,
    icon: String,
    earnedAt: Date
  }],

  // Statistics
  stats: {
    questionsAnswered: { type: Number, default: 0 },
    correctAnswers: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 },
    bestStreak: { type: Number, default: 0 },
    currentStreak: { type: Number, default: 0 },
    totalTimeSpent: { type: Number, default: 0 },
    favoriteCategory: String,
    speedBonus: { type: Number, default: 0 },
    teamContributions: { type: Number, default: 0 }
  },

  // Inventory
  inventory: {
    powerUps: [{
      id: String,
      name: String,
      quantity: Number
    }],
    themes: [String],
    avatars: [String]
  },

  // Preferences
  preferences: {
    soundEnabled: { type: Boolean, default: true },
    notificationsEnabled: { type: Boolean, default: true },
    theme: { type: String, default: 'default' }
  },

  // Team
  teamId: String,

  // Dates
  joinDate: {
    type: Date,
    default: Date.now
  },
  lastActive: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
GamificationPlayerSchema.index({ rosterId: 1, totalPoints: -1 });
GamificationPlayerSchema.index({ rosterId: 1, level: -1 });
GamificationPlayerSchema.index({ lastActive: -1 });

// Methods
GamificationPlayerSchema.methods.updateLastActive = function() {
  this.lastActive = new Date();
  return this.save();
};

GamificationPlayerSchema.methods.addPoints = function(points) {
  this.totalPoints += points;
  this.experience += points;
  this.lastActive = new Date();
  return this.save();
};

GamificationPlayerSchema.methods.unlockAchievement = function(achievement) {
  if (!this.achievements.find(a => a.id === achievement.id)) {
    this.achievements.push({
      ...achievement,
      earnedAt: new Date()
    });
    return this.save();
  }
  return Promise.resolve(this);
};

GamificationPlayerSchema.methods.awardBadge = function(badge) {
  if (!this.badges.find(b => b.id === badge.id)) {
    this.badges.push({
      ...badge,
      earnedAt: new Date()
    });
    return this.save();
  }
  return Promise.resolve(this);
};

module.exports = mongoose.model('GamificationPlayer', GamificationPlayerSchema);

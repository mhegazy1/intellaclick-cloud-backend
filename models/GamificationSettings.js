/**
 * Gamification Settings Model
 * Allows instructors to control what students can see and customize gamification behavior
 */

const mongoose = require('mongoose');

const GamificationSettingsSchema = new mongoose.Schema({
  // Settings can be per-instructor, per-class, or per-session
  instructorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    index: true
  },
  sessionId: {
    type: String,
    index: true
  },

  // Visibility Controls - What students can see
  visibility: {
    // Show gamification at all
    enabled: {
      type: Boolean,
      default: true
    },

    // Individual stats
    showOwnPoints: {
      type: Boolean,
      default: true,
      description: 'Show student their own points'
    },
    showOwnLevel: {
      type: Boolean,
      default: true,
      description: 'Show student their level'
    },
    showOwnStreak: {
      type: Boolean,
      default: true,
      description: 'Show student their streak counter'
    },
    showOwnAccuracy: {
      type: Boolean,
      default: true,
      description: 'Show student their accuracy percentage'
    },
    showOwnRank: {
      type: Boolean,
      default: true,
      description: 'Show student their class rank'
    },
    showOwnAchievements: {
      type: Boolean,
      default: true,
      description: 'Show student their unlocked achievements'
    },
    showOwnBadges: {
      type: Boolean,
      default: true,
      description: 'Show student their earned badges'
    },

    // Comparative/Social features
    showLeaderboard: {
      type: Boolean,
      default: true,
      description: 'Show class leaderboard to students'
    },
    showOthersStats: {
      type: Boolean,
      default: false,
      description: 'Show other students stats (names + points)'
    },
    showClassAverage: {
      type: Boolean,
      default: true,
      description: 'Show class average performance'
    },

    // Real-time feedback
    showPointsOnAnswer: {
      type: Boolean,
      default: true,
      description: 'Show points earned immediately after answering'
    },
    showCorrectness: {
      type: Boolean,
      default: true,
      description: 'Show if answer was correct/incorrect'
    },

    // Advanced features
    showShop: {
      type: Boolean,
      default: false,
      description: 'Enable power-up shop'
    },
    showWeeklyGoals: {
      type: Boolean,
      default: true,
      description: 'Show weekly goals progress'
    },
    showTeamFeatures: {
      type: Boolean,
      default: false,
      description: 'Enable team challenges and competitions'
    }
  },

  // Point System Configuration
  pointSystem: {
    // Base points by difficulty
    easyPoints: {
      type: Number,
      default: 50
    },
    mediumPoints: {
      type: Number,
      default: 100
    },
    hardPoints: {
      type: Number,
      default: 150
    },

    // Bonus multipliers
    speedBonusEnabled: {
      type: Boolean,
      default: true
    },
    speedBonusMultiplier: {
      type: Number,
      default: 1.0,
      min: 0,
      max: 3.0
    },
    streakBonusEnabled: {
      type: Boolean,
      default: true
    },
    streakBonusMultiplier: {
      type: Number,
      default: 1.0,
      min: 0,
      max: 3.0
    },
    firstTryBonus: {
      type: Number,
      default: 25
    },

    // Penalties
    incorrectAnswerPenalty: {
      type: Number,
      default: 0,
      description: 'Points deducted for wrong answers'
    },
    breakStreakOnIncorrect: {
      type: Boolean,
      default: true
    }
  },

  // Level System Configuration
  levelSystem: {
    enabled: {
      type: Boolean,
      default: true
    },
    maxLevel: {
      type: Number,
      default: 100
    },
    expCurve: {
      type: String,
      enum: ['linear', 'exponential', 'logarithmic'],
      default: 'exponential',
      description: 'How XP requirements scale with level'
    }
  },

  // Achievement Configuration
  achievements: {
    enabled: {
      type: Boolean,
      default: true
    },
    autoUnlock: {
      type: Boolean,
      default: true,
      description: 'Automatically unlock achievements when criteria met'
    },
    customAchievements: [{
      id: String,
      name: String,
      description: String,
      icon: String,
      criteria: String,
      points: Number
    }]
  },

  // Leaderboard Configuration
  leaderboard: {
    updateFrequency: {
      type: String,
      enum: ['realtime', 'end-of-session', 'daily', 'weekly'],
      default: 'realtime'
    },
    showTopN: {
      type: Number,
      default: 10,
      min: 3,
      max: 100
    },
    anonymizeStudents: {
      type: Boolean,
      default: false,
      description: 'Show as Student 1, Student 2, etc.'
    }
  },

  // Session-specific settings
  sessionSettings: {
    resetPointsPerSession: {
      type: Boolean,
      default: false,
      description: 'Start each session with 0 points'
    },
    carryOverStreak: {
      type: Boolean,
      default: true,
      description: 'Keep streak across sessions'
    },
    sessionLeaderboardOnly: {
      type: Boolean,
      default: false,
      description: 'Only show points from current session'
    }
  },

  // Privacy settings
  privacy: {
    allowDataExport: {
      type: Boolean,
      default: true,
      description: 'Allow students to export their data'
    },
    retentionDays: {
      type: Number,
      default: 365,
      description: 'How long to keep gamification data'
    },
    parentalConsent: {
      type: Boolean,
      default: false,
      description: 'Require parental consent for under-18'
    }
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
}, {
  timestamps: true
});

// Indexes for efficient queries
GamificationSettingsSchema.index({ instructorId: 1 });
GamificationSettingsSchema.index({ classId: 1 });
GamificationSettingsSchema.index({ sessionId: 1 });

// Methods
GamificationSettingsSchema.methods.canStudentSee = function(feature) {
  return this.visibility[feature] === true;
};

GamificationSettingsSchema.methods.getPointsForDifficulty = function(difficulty) {
  const difficultyMap = {
    'easy': this.pointSystem.easyPoints,
    'medium': this.pointSystem.mediumPoints,
    'hard': this.pointSystem.hardPoints
  };
  return difficultyMap[difficulty] || this.pointSystem.mediumPoints;
};

// Static methods
GamificationSettingsSchema.statics.getDefaultSettings = function() {
  return {
    visibility: {
      enabled: true,
      showOwnPoints: true,
      showOwnLevel: true,
      showOwnStreak: true,
      showOwnAccuracy: true,
      showOwnRank: true,
      showOwnAchievements: true,
      showOwnBadges: true,
      showLeaderboard: true,
      showOthersStats: false,
      showClassAverage: true,
      showPointsOnAnswer: true,
      showCorrectness: true,
      showShop: false,
      showWeeklyGoals: true,
      showTeamFeatures: false
    },
    pointSystem: {
      easyPoints: 50,
      mediumPoints: 100,
      hardPoints: 150,
      speedBonusEnabled: true,
      speedBonusMultiplier: 1.0,
      streakBonusEnabled: true,
      streakBonusMultiplier: 1.0,
      firstTryBonus: 25,
      incorrectAnswerPenalty: 0,
      breakStreakOnIncorrect: true
    },
    levelSystem: {
      enabled: true,
      maxLevel: 100,
      expCurve: 'exponential'
    },
    achievements: {
      enabled: true,
      autoUnlock: true,
      customAchievements: []
    },
    leaderboard: {
      updateFrequency: 'realtime',
      showTopN: 10,
      anonymizeStudents: false
    },
    sessionSettings: {
      resetPointsPerSession: false,
      carryOverStreak: true,
      sessionLeaderboardOnly: false
    },
    privacy: {
      allowDataExport: true,
      retentionDays: 365,
      parentalConsent: false
    }
  };
};

module.exports = mongoose.model('GamificationSettings', GamificationSettingsSchema);

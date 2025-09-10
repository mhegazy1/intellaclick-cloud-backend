require('dotenv').config();
const mongoose = require('mongoose');
const Achievement = require('../models/Achievement');

const achievements = [
  // Participation achievements
  {
    code: 'FIRST_STEPS',
    name: 'First Steps',
    description: 'Complete your first quiz',
    category: 'participation',
    icon: '👣',
    color: '#4CAF50',
    rarity: 'common',
    criteria: { type: 'quiz_count', value: 1 },
    points: 10
  },
  {
    code: 'ACTIVE_PARTICIPANT',
    name: 'Active Participant',
    description: 'Complete 5 quizzes',
    category: 'participation',
    icon: '🎯',
    color: '#2196F3',
    rarity: 'common',
    criteria: { type: 'quiz_count', value: 5 },
    points: 25
  },
  {
    code: 'QUIZ_VETERAN',
    name: 'Quiz Veteran',
    description: 'Complete 10 quizzes',
    category: 'participation',
    icon: '🎓',
    color: '#2196F3',
    rarity: 'uncommon',
    criteria: { type: 'quiz_count', value: 10 },
    points: 50
  },
  {
    code: 'QUIZ_MASTER',
    name: 'Quiz Master',
    description: 'Complete 50 quizzes',
    category: 'participation',
    icon: '🏆',
    color: '#FF9800',
    rarity: 'rare',
    criteria: { type: 'quiz_count', value: 50 },
    points: 200
  },
  {
    code: 'QUIZ_LEGEND',
    name: 'Quiz Legend',
    description: 'Complete 100 quizzes',
    category: 'participation',
    icon: '👑',
    color: '#FFD700',
    rarity: 'epic',
    criteria: { type: 'quiz_count', value: 100 },
    points: 500
  },

  // Performance achievements
  {
    code: 'PERFECT_SCORE',
    name: 'Perfectionist',
    description: 'Get 100% on a quiz',
    category: 'performance',
    icon: '💯',
    color: '#9C27B0',
    rarity: 'uncommon',
    criteria: { type: 'perfect_scores', value: 1 },
    points: 25
  },
  {
    code: 'PERFECT_TRIO',
    name: 'Perfect Trio',
    description: 'Get 100% on 3 quizzes',
    category: 'performance',
    icon: '🎪',
    color: '#E91E63',
    rarity: 'rare',
    criteria: { type: 'perfect_scores', value: 3 },
    points: 75
  },
  {
    code: 'PERFECT_STREAK',
    name: 'Perfect Streak',
    description: 'Get 100% on 5 quizzes',
    category: 'performance',
    icon: '🔥',
    color: '#F44336',
    rarity: 'rare',
    criteria: { type: 'perfect_scores', value: 5 },
    points: 100
  },
  {
    code: 'ACCURACY_EXPERT',
    name: 'Accuracy Expert',
    description: 'Maintain 90% or higher average accuracy',
    category: 'performance',
    icon: '🎯',
    color: '#00BCD4',
    rarity: 'rare',
    criteria: { type: 'accuracy_percentage', value: 90 },
    points: 100
  },

  // Speed achievements
  {
    code: 'QUICK_THINKER',
    name: 'Quick Thinker',
    description: 'Answer 5 questions correctly in under 5 seconds each',
    category: 'speed',
    icon: '🧠',
    color: '#FFC107',
    rarity: 'common',
    criteria: { type: 'response_speed', value: 5 },
    points: 20
  },
  {
    code: 'SPEED_DEMON',
    name: 'Speed Demon',
    description: 'Answer 25 questions correctly in under 5 seconds each',
    category: 'speed',
    icon: '⚡',
    color: '#FFEB3B',
    rarity: 'uncommon',
    criteria: { type: 'response_speed', value: 25 },
    points: 50
  },
  {
    code: 'LIGHTNING_REFLEXES',
    name: 'Lightning Reflexes',
    description: 'Answer 100 questions correctly in under 5 seconds each',
    category: 'speed',
    icon: '🌩️',
    color: '#FFD700',
    rarity: 'epic',
    criteria: { type: 'response_speed', value: 100 },
    points: 200
  },

  // Consistency achievements
  {
    code: 'THREE_DAY_STREAK',
    name: 'Getting Started',
    description: 'Maintain a 3-day attendance streak',
    category: 'consistency',
    icon: '📅',
    color: '#8BC34A',
    rarity: 'common',
    criteria: { type: 'attendance_streak', value: 3 },
    points: 15
  },
  {
    code: 'WEEK_WARRIOR',
    name: 'Week Warrior',
    description: 'Maintain a 7-day attendance streak',
    category: 'consistency',
    icon: '📅',
    color: '#00BCD4',
    rarity: 'uncommon',
    criteria: { type: 'attendance_streak', value: 7 },
    points: 40
  },
  {
    code: 'FORTNIGHT_FIGHTER',
    name: 'Fortnight Fighter',
    description: 'Maintain a 14-day attendance streak',
    category: 'consistency',
    icon: '🗓️',
    color: '#3F51B5',
    rarity: 'rare',
    criteria: { type: 'attendance_streak', value: 14 },
    points: 80
  },
  {
    code: 'MONTH_MASTER',
    name: 'Month Master',
    description: 'Maintain a 30-day attendance streak',
    category: 'consistency',
    icon: '📆',
    color: '#673AB7',
    rarity: 'epic',
    criteria: { type: 'attendance_streak', value: 30 },
    points: 150
  },

  // Milestone achievements
  {
    code: 'FIRST_TEN',
    name: 'Getting Warmed Up',
    description: 'Answer 10 questions',
    category: 'milestone',
    icon: '🔟',
    color: '#607D8B',
    rarity: 'common',
    criteria: { type: 'questions_answered', value: 10 },
    points: 10
  },
  {
    code: 'HALF_CENTURY',
    name: 'Half Century',
    description: 'Answer 50 questions',
    category: 'milestone',
    icon: '5️⃣0️⃣',
    color: '#795548',
    rarity: 'common',
    criteria: { type: 'questions_answered', value: 50 },
    points: 25
  },
  {
    code: 'CENTURY_CLUB',
    name: 'Century Club',
    description: 'Answer 100 questions',
    category: 'milestone',
    icon: '💯',
    color: '#FF5722',
    rarity: 'uncommon',
    criteria: { type: 'questions_answered', value: 100 },
    points: 50
  },
  {
    code: 'QUESTION_MASTER',
    name: 'Question Master',
    description: 'Answer 500 questions',
    category: 'milestone',
    icon: '🎖️',
    color: '#E91E63',
    rarity: 'rare',
    criteria: { type: 'questions_answered', value: 500 },
    points: 200
  },
  {
    code: 'THOUSAND_ANSWERS',
    name: 'Thousand Answers',
    description: 'Answer 1000 questions',
    category: 'milestone',
    icon: '🌟',
    color: '#9C27B0',
    rarity: 'epic',
    criteria: { type: 'questions_answered', value: 1000 },
    points: 500
  },
  {
    code: 'POINT_COLLECTOR',
    name: 'Point Collector',
    description: 'Earn 100 total points',
    category: 'milestone',
    icon: '💰',
    color: '#FFC107',
    rarity: 'common',
    criteria: { type: 'total_points', value: 100 },
    points: 20
  },
  {
    code: 'POINT_HOARDER',
    name: 'Point Hoarder',
    description: 'Earn 1000 total points',
    category: 'milestone',
    icon: '💎',
    color: '#2196F3',
    rarity: 'rare',
    criteria: { type: 'total_points', value: 1000 },
    points: 100
  },
  {
    code: 'POINT_TYCOON',
    name: 'Point Tycoon',
    description: 'Earn 5000 total points',
    category: 'milestone',
    icon: '🏰',
    color: '#FFD700',
    rarity: 'legendary',
    criteria: { type: 'total_points', value: 5000 },
    points: 500
  },

  // Social achievements
  {
    code: 'TOP_THREE',
    name: 'Podium Finish',
    description: 'Finish in top 3 of a class session',
    category: 'social',
    icon: '🥉',
    color: '#CD7F32',
    rarity: 'common',
    criteria: { type: 'top_position', value: 3 },
    points: 20
  },
  {
    code: 'CLASS_LEADER',
    name: 'Class Leader',
    description: 'Rank #1 in your class',
    category: 'social',
    icon: '🥇',
    color: '#FFD700',
    rarity: 'rare',
    criteria: { type: 'class_rank', value: 1 },
    points: 100
  },

  // Special/Hidden achievements
  {
    code: 'NIGHT_OWL',
    name: 'Night Owl',
    description: 'Complete a quiz between midnight and 5 AM',
    category: 'special',
    icon: '🦉',
    color: '#1A237E',
    rarity: 'rare',
    criteria: { type: 'special_condition', value: 'night_quiz' },
    points: 50,
    isHidden: true
  },
  {
    code: 'EARLY_BIRD',
    name: 'Early Bird',
    description: 'Complete a quiz between 5 AM and 7 AM',
    category: 'special',
    icon: '🐦',
    color: '#F57C00',
    rarity: 'rare',
    criteria: { type: 'special_condition', value: 'early_quiz' },
    points: 50,
    isHidden: true
  },
  {
    code: 'WEEKEND_WARRIOR',
    name: 'Weekend Warrior',
    description: 'Complete 5 quizzes on weekends',
    category: 'special',
    icon: '🎪',
    color: '#7B1FA2',
    rarity: 'uncommon',
    criteria: { type: 'special_condition', value: 'weekend_quizzes' },
    points: 40,
    isHidden: true
  },
  {
    code: 'COMEBACK_KID',
    name: 'Comeback Kid',
    description: 'Improve your score by 50% or more on a retake',
    category: 'special',
    icon: '🔄',
    color: '#00897B',
    rarity: 'rare',
    criteria: { type: 'special_condition', value: 'comeback' },
    points: 60,
    isHidden: true
  }
];

async function seedAchievements() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/intellaclick', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('Connected to MongoDB');
    
    // Clear existing achievements (optional - comment out if you want to keep existing)
    await Achievement.deleteMany({});
    console.log('Cleared existing achievements');
    
    // Insert new achievements
    const results = await Achievement.insertMany(achievements);
    console.log(`Inserted ${results.length} achievements`);
    
    // Display summary
    const summary = await Achievement.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalPoints: { $sum: '$points' }
        }
      }
    ]);
    
    console.log('\nAchievement Summary:');
    summary.forEach(cat => {
      console.log(`- ${cat._id}: ${cat.count} achievements, ${cat.totalPoints} total points`);
    });
    
    console.log('\nRarity Distribution:');
    const rarityCount = await Achievement.aggregate([
      {
        $group: {
          _id: '$rarity',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    rarityCount.forEach(r => {
      console.log(`- ${r._id}: ${r.count} achievements`);
    });
    
  } catch (error) {
    console.error('Error seeding achievements:', error);
  } finally {
    mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

// Run the seed function
seedAchievements();
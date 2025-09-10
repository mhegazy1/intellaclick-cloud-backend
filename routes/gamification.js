const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const GamificationService = require('../services/gamificationService');
const Achievement = require('../models/Achievement');
const StudentProgress = require('../models/StudentProgress');
const ClassEnrollment = require('../models/ClassEnrollment');

/**
 * Get student's progress for a specific class
 */
router.get('/progress/:classId', auth, async (req, res) => {
  try {
    const { classId } = req.params;
    const studentId = req.user._id || req.user.userId;
    
    // Verify student is enrolled in the class
    const enrollment = await ClassEnrollment.findOne({
      classId,
      studentId,
      status: 'enrolled'
    });
    
    if (!enrollment) {
      return res.status(403).json({
        success: false,
        error: 'You must be enrolled in this class to view progress'
      });
    }
    
    const progress = await GamificationService.getStudentProgress(studentId, classId);
    
    if (!progress) {
      // Return empty progress for new students
      return res.json({
        success: true,
        progress: {
          level: 1,
          experience: 0,
          experienceToNextLevel: 100,
          totalPoints: 0,
          currentPoints: 0,
          stats: {
            quizzesTaken: 0,
            questionsAnswered: 0,
            correctAnswers: 0,
            accuracy: 0,
            bestScore: 0,
            perfectScores: 0,
            currentStreak: 0,
            longestStreak: 0
          },
          rankings: {
            class: 0,
            allTime: 0,
            weekly: 0
          },
          achievements: [],
          milestones: {}
        }
      });
    }
    
    res.json({
      success: true,
      progress
    });
  } catch (error) {
    console.error('Error fetching student progress:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch progress'
    });
  }
});

/**
 * Get class leaderboard
 */
router.get('/leaderboard/:classId', auth, async (req, res) => {
  try {
    const { classId } = req.params;
    const { type = 'all-time', limit = 10 } = req.query;
    
    // Verify user has access to this class (enrolled student or instructor)
    const studentId = req.user._id || req.user.userId;
    const enrollment = await ClassEnrollment.findOne({
      classId,
      studentId,
      status: 'enrolled'
    });
    
    const Class = require('../models/Class');
    const isInstructor = await Class.findOne({
      _id: classId,
      $or: [
        { instructorId: studentId },
        { coInstructors: studentId },
        { teachingAssistants: studentId }
      ]
    });
    
    if (!enrollment && !isInstructor) {
      return res.status(403).json({
        success: false,
        error: 'You must be enrolled in this class to view the leaderboard'
      });
    }
    
    const leaderboard = await GamificationService.getClassLeaderboard(
      classId, 
      type, 
      parseInt(limit)
    );
    
    // Get current user's rank if they're a student
    let userRank = null;
    if (enrollment) {
      const userProgress = await StudentProgress.findOne({ studentId, classId });
      if (userProgress) {
        userRank = {
          rank: userProgress.classRank,
          points: userProgress.totalPoints,
          level: userProgress.level
        };
      }
    }
    
    res.json({
      success: true,
      leaderboard,
      userRank,
      type,
      totalStudents: await ClassEnrollment.countDocuments({ classId, status: 'enrolled' })
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch leaderboard'
    });
  }
});

/**
 * Get all available achievements
 */
router.get('/achievements', auth, async (req, res) => {
  try {
    const { category } = req.query;
    const query = { isActive: true };
    
    if (category) {
      query.category = category;
    }
    
    const achievements = await Achievement.find(query)
      .select('-__v -updatedAt')
      .sort({ rarity: 1, points: -1 });
    
    // Group by category
    const groupedAchievements = achievements.reduce((acc, achievement) => {
      if (!acc[achievement.category]) {
        acc[achievement.category] = [];
      }
      
      // Hide details of hidden achievements
      if (achievement.isHidden) {
        acc[achievement.category].push({
          id: achievement._id,
          name: '???',
          description: 'Hidden achievement - unlock to reveal!',
          icon: '🔒',
          rarity: achievement.rarity,
          isHidden: true
        });
      } else {
        acc[achievement.category].push({
          id: achievement._id,
          code: achievement.code,
          name: achievement.name,
          description: achievement.description,
          icon: achievement.icon,
          color: achievement.color,
          rarity: achievement.rarity,
          points: achievement.points,
          criteria: achievement.criteria
        });
      }
      
      return acc;
    }, {});
    
    res.json({
      success: true,
      achievements: groupedAchievements,
      totalAchievements: achievements.length
    });
  } catch (error) {
    console.error('Error fetching achievements:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch achievements'
    });
  }
});

/**
 * Get student's achievements for a class
 */
router.get('/achievements/:classId/student', auth, async (req, res) => {
  try {
    const { classId } = req.params;
    const studentId = req.user._id || req.user.userId;
    
    const progress = await StudentProgress.findOne({ studentId, classId })
      .populate('achievements.achievementId');
    
    if (!progress) {
      return res.json({
        success: true,
        achievements: [],
        totalEarned: 0,
        totalPoints: 0
      });
    }
    
    const achievements = progress.achievements.map(a => ({
      id: a.achievementId._id,
      code: a.achievementId.code,
      name: a.achievementId.name,
      description: a.achievementId.description,
      icon: a.achievementId.icon,
      color: a.achievementId.color,
      rarity: a.achievementId.rarity,
      points: a.achievementId.points,
      earnedAt: a.earnedAt,
      progress: a.progress
    }));
    
    const totalPoints = achievements.reduce((sum, a) => sum + a.points, 0);
    
    res.json({
      success: true,
      achievements,
      totalEarned: achievements.length,
      totalPoints
    });
  } catch (error) {
    console.error('Error fetching student achievements:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch achievements'
    });
  }
});

/**
 * Award manual points (instructor only)
 */
router.post('/award-points', auth, async (req, res) => {
  try {
    const { studentId, classId, points, reason } = req.body;
    const instructorId = req.user._id || req.user.userId;
    
    // Verify instructor owns the class
    const Class = require('../models/Class');
    const classDoc = await Class.findOne({
      _id: classId,
      $or: [
        { instructorId },
        { coInstructors: instructorId },
        { teachingAssistants: instructorId }
      ]
    });
    
    if (!classDoc) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to award points in this class'
      });
    }
    
    // Verify student is enrolled
    const enrollment = await ClassEnrollment.findOne({
      classId,
      studentId,
      status: 'enrolled'
    });
    
    if (!enrollment) {
      return res.status(404).json({
        success: false,
        error: 'Student is not enrolled in this class'
      });
    }
    
    const result = await GamificationService.awardPoints(
      studentId,
      classId,
      points,
      reason || 'Manual award by instructor'
    );
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Error awarding points:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to award points'
    });
  }
});

/**
 * Initialize default achievements (admin only)
 */
router.post('/init-achievements', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }
    
    // Default achievements
    const defaultAchievements = [
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
      
      // Speed achievements
      {
        code: 'SPEED_DEMON',
        name: 'Speed Demon',
        description: 'Answer 10 questions correctly in under 5 seconds each',
        category: 'speed',
        icon: '⚡',
        color: '#FFEB3B',
        rarity: 'uncommon',
        criteria: { type: 'response_speed', value: 10 },
        points: 30
      },
      
      // Consistency achievements
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
        code: 'MONTH_MASTER',
        name: 'Month Master',
        description: 'Maintain a 30-day attendance streak',
        category: 'consistency',
        icon: '📆',
        color: '#3F51B5',
        rarity: 'epic',
        criteria: { type: 'attendance_streak', value: 30 },
        points: 150
      },
      
      // Milestone achievements
      {
        code: 'CENTURY_CLUB',
        name: 'Century Club',
        description: 'Answer 100 questions',
        category: 'milestone',
        icon: '💯',
        color: '#795548',
        rarity: 'uncommon',
        criteria: { type: 'questions_answered', value: 100 },
        points: 50
      },
      {
        code: 'THOUSAND_ANSWERS',
        name: 'Thousand Answers',
        description: 'Answer 1000 questions',
        category: 'milestone',
        icon: '🌟',
        color: '#607D8B',
        rarity: 'epic',
        criteria: { type: 'questions_answered', value: 1000 },
        points: 500
      },
      
      // Hidden achievements
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
      }
    ];
    
    // Insert achievements (skip if already exists)
    const results = [];
    for (const achievement of defaultAchievements) {
      try {
        const existing = await Achievement.findOne({ code: achievement.code });
        if (!existing) {
          const newAchievement = await Achievement.create(achievement);
          results.push({ code: achievement.code, status: 'created' });
        } else {
          results.push({ code: achievement.code, status: 'exists' });
        }
      } catch (err) {
        results.push({ code: achievement.code, status: 'error', error: err.message });
      }
    }
    
    res.json({
      success: true,
      message: 'Achievements initialized',
      results
    });
  } catch (error) {
    console.error('Error initializing achievements:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize achievements'
    });
  }
});

module.exports = router;
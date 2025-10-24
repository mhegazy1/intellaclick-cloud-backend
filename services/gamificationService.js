const StudentProgress = require('../models/StudentProgress');
const Achievement = require('../models/Achievement');
const ClassEnrollment = require('../models/ClassEnrollment');

class GamificationService {
  /**
   * Award points to a student and update their progress
   * @param {String} studentId - Student's user ID
   * @param {String} classId - Class ID
   * @param {Number} points - Points to award
   * @param {String} reason - Reason for points (for logging)
   * @returns {Object} Updated progress with level up info if applicable
   */
  static async awardPoints(studentId, classId, points, reason = 'activity') {
    try {
      const mongoose = require('mongoose');

      // Convert IDs to ObjectId if they're strings
      const studentObjectId = typeof studentId === 'string' ? new mongoose.Types.ObjectId(studentId) : studentId;
      const classObjectId = typeof classId === 'string' ? new mongoose.Types.ObjectId(classId) : classId;

      console.log('[GamificationService] awardPoints called with:', {
        studentId,
        classId,
        studentObjectId: studentObjectId.toString(),
        classObjectId: classObjectId.toString(),
        points,
        reason
      });

      // Find or create student progress
      let progress = await StudentProgress.findOne({
        studentId: studentObjectId,
        classId: classObjectId
      });

      if (!progress) {
        console.log('[GamificationService] Creating new StudentProgress record');
        progress = new StudentProgress({
          studentId: studentObjectId,
          classId: classObjectId
        });
      } else {
        console.log('[GamificationService] Found existing StudentProgress:', {
          currentPoints: progress.totalPoints
        });
      }

      // Award points
      progress.totalPoints += points;
      progress.currentPoints += points;

      // Add experience (XP is same as points for simplicity)
      const levelUpInfo = progress.addExperience(points);

      // Update weekly and monthly stats
      progress.weeklyStats.points += points;
      progress.monthlyStats.points += points;

      await progress.save();
      console.log('[GamificationService] Points saved. New total:', progress.totalPoints);

      // Check for point-based achievements
      await this.checkPointAchievements(studentObjectId, classObjectId, progress);

      return {
        success: true,
        points: progress.totalPoints,
        newPoints: points,
        reason,
        ...levelUpInfo
      };
    } catch (error) {
      console.error('Error awarding points:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Process quiz/session results and award appropriate points and achievements
   * @param {String} studentId - Student's user ID
   * @param {String} classId - Class ID
   * @param {Object} sessionResults - Results from the session
   */
  static async processSessionResults(studentId, classId, sessionResults) {
    try {
      const {
        totalQuestions,
        correctAnswers,
        totalTime,
        responses = []
      } = sessionResults;
      
      let progress = await StudentProgress.findOne({ studentId, classId });
      if (!progress) {
        progress = new StudentProgress({ studentId, classId });
      }
      
      // Update basic stats
      progress.quizzesTaken += 1;
      progress.questionsAnswered += totalQuestions;
      progress.correctAnswers += correctAnswers;
      
      // Calculate score percentage
      const scorePercentage = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;
      
      // Update averages
      const totalAnswered = progress.questionsAnswered;
      progress.averageScore = totalAnswered > 0 
        ? ((progress.averageScore * (totalAnswered - totalQuestions) + scorePercentage * totalQuestions) / totalAnswered)
        : scorePercentage;
      
      if (scorePercentage > progress.bestScore) {
        progress.bestScore = scorePercentage;
      }
      
      // Check for perfect score
      if (scorePercentage === 100 && totalQuestions > 0) {
        progress.perfectScores += 1;
        if (!progress.milestones.firstPerfectScore) {
          progress.milestones.firstPerfectScore = new Date();
        }
      }
      
      // Process response times
      let fastResponseCount = 0;
      let totalResponseTime = 0;
      responses.forEach(response => {
        const responseTime = response.responseTime || 0;
        totalResponseTime += responseTime;
        if (responseTime < 5000 && response.isCorrect) { // Under 5 seconds
          fastResponseCount++;
        }
      });
      
      progress.fastResponses += fastResponseCount;
      if (responses.length > 0) {
        const avgTime = totalResponseTime / responses.length;
        progress.averageResponseTime = progress.averageResponseTime > 0
          ? (progress.averageResponseTime + avgTime) / 2
          : avgTime;
      }
      
      // Update streaks
      progress.updateStreak();
      
      // Update weekly/monthly stats
      progress.weeklyStats.quizzesTaken += 1;
      progress.weeklyStats.accuracy = progress.averageScore;
      progress.monthlyStats.quizzesTaken += 1;
      progress.monthlyStats.accuracy = progress.averageScore;
      
      // Check milestones
      if (progress.quizzesTaken === 1 && !progress.milestones.firstQuiz) {
        progress.milestones.firstQuiz = new Date();
      }
      if (progress.quizzesTaken === 10 && !progress.milestones.tenthQuiz) {
        progress.milestones.tenthQuiz = new Date();
      }
      if (progress.questionsAnswered >= 100 && !progress.milestones.hundredthQuestion) {
        progress.milestones.hundredthQuestion = new Date();
      }
      
      // Calculate points to award
      let pointsToAward = 0;
      
      // Base points for participation
      pointsToAward += 10;
      
      // Points for correct answers (5 points each)
      pointsToAward += correctAnswers * 5;
      
      // Bonus for perfect score
      if (scorePercentage === 100 && totalQuestions >= 5) {
        pointsToAward += 50;
      }
      
      // Bonus for speed (1 point per fast response)
      pointsToAward += fastResponseCount;
      
      // Award points and check for level up
      const levelUpInfo = progress.addExperience(pointsToAward);
      progress.totalPoints += pointsToAward;
      progress.currentPoints += pointsToAward;
      progress.weeklyStats.points += pointsToAward;
      progress.monthlyStats.points += pointsToAward;
      
      await progress.save();
      
      // Check for achievements
      const newAchievements = await this.checkAllAchievements(studentId, classId, progress);
      
      // Update class rank
      await this.updateClassRankings(classId);
      
      return {
        success: true,
        progress: {
          level: progress.level,
          experience: progress.experience,
          totalPoints: progress.totalPoints,
          streak: progress.currentStreak,
          averageScore: progress.averageScore
        },
        sessionStats: {
          score: scorePercentage,
          pointsEarned: pointsToAward,
          correctAnswers,
          totalQuestions,
          fastResponses: fastResponseCount
        },
        levelUpInfo,
        newAchievements,
        milestones: progress.milestones
      };
    } catch (error) {
      console.error('Error processing session results:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Check all possible achievements for a student
   */
  static async checkAllAchievements(studentId, classId, progress) {
    try {
      const achievements = await Achievement.find({ isActive: true });
      const newAchievements = [];
      
      // Get existing achievements
      const earnedAchievementIds = progress.achievements.map(a => a.achievementId.toString());
      
      for (const achievement of achievements) {
        // Skip if already earned
        if (earnedAchievementIds.includes(achievement._id.toString())) {
          continue;
        }
        
        // Check if criteria is met
        const criteriaData = {
          quizzesTaken: progress.quizzesTaken,
          perfectScores: progress.perfectScores,
          currentStreak: progress.currentStreak,
          fastResponses: progress.fastResponses,
          totalPoints: progress.totalPoints,
          questionsAnswered: progress.questionsAnswered,
          accuracy: progress.averageScore,
          level: progress.level
        };
        
        if (Achievement.checkCriteria(achievement.criteria, criteriaData)) {
          // Award achievement
          progress.achievements.push({
            achievementId: achievement._id,
            earnedAt: new Date(),
            progress: 100
          });
          
          // Award achievement points
          progress.totalPoints += achievement.points;
          progress.currentPoints += achievement.points;
          
          // Update achievement stats
          achievement.totalAwarded += 1;
          if (!achievement.firstAwardedTo) {
            achievement.firstAwardedTo = studentId;
            achievement.firstAwardedAt = new Date();
          }
          await achievement.save();
          
          newAchievements.push({
            id: achievement._id,
            code: achievement.code,
            name: achievement.name,
            description: achievement.description,
            icon: achievement.icon,
            points: achievement.points,
            rarity: achievement.rarity
          });
          
          // Track first badge milestone
          if (progress.achievements.length === 1 && !progress.milestones.firstBadge) {
            progress.milestones.firstBadge = new Date();
          }
        }
      }
      
      if (newAchievements.length > 0) {
        await progress.save();
      }
      
      return newAchievements;
    } catch (error) {
      console.error('Error checking achievements:', error);
      return [];
    }
  }
  
  /**
   * Check for point-based achievements
   */
  static async checkPointAchievements(studentId, classId, progress) {
    const pointAchievements = await Achievement.find({
      isActive: true,
      'criteria.type': 'total_points'
    });
    
    for (const achievement of pointAchievements) {
      const hasAchievement = progress.achievements.some(
        a => a.achievementId.toString() === achievement._id.toString()
      );
      
      if (!hasAchievement && progress.totalPoints >= achievement.criteria.value) {
        progress.achievements.push({
          achievementId: achievement._id,
          earnedAt: new Date()
        });
        
        // Award bonus points for earning achievement
        progress.totalPoints += achievement.points;
        progress.currentPoints += achievement.points;
      }
    }
    
    await progress.save();
  }
  
  /**
   * Update class rankings based on total points
   */
  static async updateClassRankings(classId) {
    try {
      // Get all student progress for this class, sorted by points
      const allProgress = await StudentProgress.find({ classId })
        .sort({ totalPoints: -1 })
        .select('studentId totalPoints classRank');
      
      // Update ranks
      for (let i = 0; i < allProgress.length; i++) {
        const progress = allProgress[i];
        const newRank = i + 1;
        
        if (progress.classRank !== newRank) {
          progress.previousClassRank = progress.classRank || newRank;
          progress.classRank = newRank;
          await progress.save();
        }
      }
    } catch (error) {
      console.error('Error updating class rankings:', error);
    }
  }
  
  /**
   * Get leaderboard for a class
   */
  static async getClassLeaderboard(classId, type = 'all-time', limit = 10) {
    try {
      const mongoose = require('mongoose');

      // Convert classId to ObjectId if it's a string
      const classObjectId = typeof classId === 'string' ? new mongoose.Types.ObjectId(classId) : classId;

      console.log('[GamificationService] getClassLeaderboard called with:', {
        classId,
        classObjectId: classObjectId.toString(),
        type,
        limit
      });

      let sortField = 'totalPoints';
      let additionalFilter = {};

      switch (type) {
        case 'weekly':
          sortField = 'weeklyStats.points';
          break;
        case 'monthly':
          sortField = 'monthlyStats.points';
          break;
        case 'level':
          sortField = 'level';
          break;
      }

      // First check if any records exist for this class
      const totalRecords = await StudentProgress.countDocuments({ classId: classObjectId });
      console.log('[GamificationService] Total StudentProgress records for classId:', totalRecords);

      // Also check all records to see what classIds exist
      const allRecords = await StudentProgress.find({}).select('classId studentId totalPoints').limit(10);
      console.log('[GamificationService] Sample StudentProgress records:', JSON.stringify(allRecords, null, 2));

      const leaderboard = await StudentProgress.find({ classId: classObjectId, ...additionalFilter })
        .sort({ [sortField]: -1 })
        .limit(limit)
        .populate('studentId', 'profile.firstName profile.lastName email')
        .select('studentId totalPoints level weeklyStats monthlyStats classRank currentStreak');

      console.log('[GamificationService] Leaderboard query returned:', leaderboard.length, 'records');

      // Filter out entries where student user doesn't exist and map to response format
      return leaderboard
        .filter(entry => {
          if (!entry.studentId) {
            console.warn('[GamificationService] Skipping entry - student user deleted:', entry._id);
            return false;
          }
          return true;
        })
        .map((entry, index) => ({
          rank: index + 1,
          studentId: entry.studentId._id,
          studentName: `${entry.studentId.profile.firstName} ${entry.studentId.profile.lastName}`,
          studentEmail: entry.studentId.email,
          points: type === 'weekly' ? entry.weeklyStats.points :
                  type === 'monthly' ? entry.monthlyStats.points :
                  entry.totalPoints,
          level: entry.level,
          streak: entry.currentStreak,
          previousRank: entry.previousClassRank
        }));
    } catch (error) {
      console.error('Error getting leaderboard:', error);
      return [];
    }
  }
  
  /**
   * Get a student's progress and achievements for a class
   */
  static async getStudentProgress(studentId, classId) {
    try {
      const progress = await StudentProgress.findOne({ studentId, classId })
        .populate('achievements.achievementId');
      
      if (!progress) {
        return null;
      }
      
      // Get student's position in various leaderboards
      const allTimeRank = await StudentProgress.countDocuments({
        classId,
        totalPoints: { $gt: progress.totalPoints }
      }) + 1;
      
      const weeklyRank = await StudentProgress.countDocuments({
        classId,
        'weeklyStats.points': { $gt: progress.weeklyStats.points }
      }) + 1;
      
      return {
        level: progress.level,
        experience: progress.experience,
        experienceToNextLevel: progress.experienceToNextLevel,
        totalPoints: progress.totalPoints,
        currentPoints: progress.currentPoints,
        stats: {
          quizzesTaken: progress.quizzesTaken,
          questionsAnswered: progress.questionsAnswered,
          correctAnswers: progress.correctAnswers,
          accuracy: progress.averageScore,
          bestScore: progress.bestScore,
          perfectScores: progress.perfectScores,
          currentStreak: progress.currentStreak,
          longestStreak: progress.longestStreak
        },
        rankings: {
          class: progress.classRank,
          allTime: allTimeRank,
          weekly: weeklyRank
        },
        achievements: progress.achievements.map(a => ({
          id: a.achievementId._id,
          code: a.achievementId.code,
          name: a.achievementId.name,
          description: a.achievementId.description,
          icon: a.achievementId.icon,
          rarity: a.achievementId.rarity,
          earnedAt: a.earnedAt
        })),
        milestones: progress.milestones
      };
    } catch (error) {
      console.error('Error getting student progress:', error);
      return null;
    }
  }
}

module.exports = GamificationService;
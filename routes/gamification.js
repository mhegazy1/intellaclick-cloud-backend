/**
 * Gamification API Routes
 * Handles student gamification data (points, levels, achievements, leaderboards)
 */

const express = require('express');
const router = express.Router();
const GamificationPlayer = require('../models/GamificationPlayer');
const GamificationSettings = require('../models/GamificationSettings');
const GamificationService = require('../services/gamificationService');

// Debug middleware
router.use((req, res, next) => {
  console.log(`[Gamification Router] ${req.method} ${req.path}`);
  next();
});

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Gamification API is running'
  });
});

// Get or create player by ID
router.get('/player/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;
    console.log(`[Gamification] Fetching player: ${playerId}`);

    let player = await GamificationPlayer.findOne({ playerId });

    if (!player) {
      console.log(`[Gamification] Player not found, returning default data`);
      // Return default player data instead of 404
      return res.json({
        success: true,
        player: {
          playerId,
          name: 'Student',
          level: 1,
          totalPoints: 0,
          experience: 0,
          coins: 0,
          stats: {
            questionsAnswered: 0,
            correctAnswers: 0,
            accuracy: 0,
            bestStreak: 0,
            currentStreak: 0
          },
          badges: [],
          achievements: [],
          inventory: {
            powerUps: [],
            themes: ['default'],
            avatars: ['🎮']
          }
        }
      });
    }

    res.json({
      success: true,
      player
    });

  } catch (error) {
    console.error('[Gamification] Error fetching player:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update or create player data (upsert)
router.post('/player/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;
    const playerData = req.body;

    console.log(`[Gamification] Upserting player: ${playerId}`);

    const player = await GamificationPlayer.findOneAndUpdate(
      { playerId },
      {
        ...playerData,
        playerId,
        lastActive: new Date()
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    console.log(`[Gamification] Player upserted successfully`);

    res.json({
      success: true,
      player
    });

  } catch (error) {
    console.error('[Gamification] Error upserting player:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Batch upsert players (for syncing from desktop app)
router.post('/players/sync', async (req, res) => {
  try {
    const { players } = req.body;

    if (!Array.isArray(players)) {
      return res.status(400).json({
        success: false,
        error: 'Players must be an array'
      });
    }

    console.log(`[Gamification] Syncing ${players.length} players`);

    const operations = players.map(player => ({
      updateOne: {
        filter: { playerId: player.playerId || player.id },
        update: {
          ...player,
          playerId: player.playerId || player.id,
          lastActive: new Date()
        },
        upsert: true
      }
    }));

    const result = await GamificationPlayer.bulkWrite(operations);

    console.log(`[Gamification] Sync complete:`, {
      upserted: result.upsertedCount,
      modified: result.modifiedCount
    });

    res.json({
      success: true,
      upserted: result.upsertedCount,
      modified: result.modifiedCount,
      total: result.upsertedCount + result.modifiedCount
    });

  } catch (error) {
    console.error('[Gamification] Error syncing players:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get leaderboard for a roster/class
router.get('/leaderboard/:rosterId', async (req, res) => {
  try {
    const { rosterId } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    const type = req.query.type || 'allTime'; // allTime, weekly, monthly

    console.log(`[Gamification] Fetching leaderboard for roster: ${rosterId}`);

    // Convert query type to service format (allTime -> all-time)
    const serviceType = type === 'allTime' ? 'all-time' : type;

    // Use GamificationService to get leaderboard from StudentProgress collection
    const leaderboard = await GamificationService.getClassLeaderboard(rosterId, serviceType, limit);

    res.json({
      success: true,
      leaderboard,
      count: leaderboard.length
    });

  } catch (error) {
    console.error('[Gamification] Error fetching leaderboard:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get player rank within roster
router.get('/player/:playerId/rank/:rosterId', async (req, res) => {
  try {
    const { playerId, rosterId } = req.params;

    console.log(`[Gamification] Getting rank for player ${playerId} in roster ${rosterId}`);

    const player = await GamificationPlayer.findOne({ playerId });

    if (!player) {
      return res.json({
        success: true,
        rank: null,
        totalPlayers: 0
      });
    }

    // Handle "unassigned" as special case for players without a rosterId
    const query = rosterId === 'unassigned'
      ? { $or: [{ rosterId: null }, { rosterId: { $exists: false } }] }
      : { rosterId };

    // Count players with more points in the same roster
    const rank = await GamificationPlayer.countDocuments({
      ...query,
      totalPoints: { $gt: player.totalPoints }
    }) + 1;

    const totalPlayers = await GamificationPlayer.countDocuments(query);

    res.json({
      success: true,
      rank,
      totalPlayers,
      percentile: Math.round((1 - (rank / totalPlayers)) * 100)
    });

  } catch (error) {
    console.error('[Gamification] Error getting rank:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get analytics for a roster
router.get('/analytics/:rosterId', async (req, res) => {
  try {
    const { rosterId } = req.params;

    console.log(`[Gamification] Fetching analytics for roster: ${rosterId}`);

    // Handle "unassigned" as special case for players without a rosterId
    const query = rosterId === 'unassigned'
      ? { $or: [{ rosterId: null }, { rosterId: { $exists: false } }] }
      : { rosterId };

    const players = await GamificationPlayer.find(query);

    if (players.length === 0) {
      return res.json({
        success: true,
        analytics: {
          totalPlayers: 0,
          totalPoints: 0,
          averageLevel: 0,
          averageAccuracy: 0,
          topPerformers: []
        }
      });
    }

    const totalPoints = players.reduce((sum, p) => sum + p.totalPoints, 0);
    const totalLevels = players.reduce((sum, p) => sum + p.level, 0);
    const totalAccuracy = players.reduce((sum, p) => sum + (p.stats.accuracy || 0), 0);

    const topPerformers = players
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, 10)
      .map(p => ({
        playerId: p.playerId,
        name: p.name,
        totalPoints: p.totalPoints,
        level: p.level,
        accuracy: p.stats.accuracy
      }));

    res.json({
      success: true,
      analytics: {
        totalPlayers: players.length,
        totalPoints,
        averageLevel: Math.round(totalLevels / players.length * 10) / 10,
        averageAccuracy: Math.round(totalAccuracy / players.length * 10) / 10,
        averagePoints: Math.round(totalPoints / players.length),
        topPerformers
      }
    });

  } catch (error) {
    console.error('[Gamification] Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Award achievement to player
router.post('/player/:playerId/achievement', async (req, res) => {
  try {
    const { playerId } = req.params;
    const achievement = req.body;

    console.log(`[Gamification] Awarding achievement to ${playerId}:`, achievement.id);

    const player = await GamificationPlayer.findOne({ playerId });

    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      });
    }

    await player.unlockAchievement(achievement);

    res.json({
      success: true,
      achievements: player.achievements
    });

  } catch (error) {
    console.error('[Gamification] Error awarding achievement:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Award badge to player
router.post('/player/:playerId/badge', async (req, res) => {
  try {
    const { playerId } = req.params;
    const badge = req.body;

    console.log(`[Gamification] Awarding badge to ${playerId}:`, badge.id);

    const player = await GamificationPlayer.findOne({ playerId });

    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      });
    }

    await player.awardBadge(badge);

    res.json({
      success: true,
      badges: player.badges
    });

  } catch (error) {
    console.error('[Gamification] Error awarding badge:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// INSTRUCTOR SETTINGS ROUTES
// ========================================

// Get settings for instructor/class/session
router.get('/settings/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    console.log(`[Gamification] Fetching settings for ${type}: ${id}`);

    const query = {};
    if (type === 'instructor') query.instructorId = id;
    else if (type === 'class') query.classId = id;
    else if (type === 'session') query.sessionId = id;
    else {
      return res.status(400).json({
        success: false,
        error: 'Invalid type. Must be: instructor, class, or session'
      });
    }

    let settings = await GamificationSettings.findOne(query);

    if (!settings) {
      // Return default settings if none exist
      console.log(`[Gamification] No settings found, returning defaults`);
      return res.json({
        success: true,
        settings: GamificationSettings.getDefaultSettings(),
        isDefault: true
      });
    }

    res.json({
      success: true,
      settings,
      isDefault: false
    });

  } catch (error) {
    console.error('[Gamification] Error fetching settings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create or update settings
router.post('/settings/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    const settingsData = req.body;

    console.log(`[Gamification] Updating settings for ${type}: ${id}`);

    const query = {};
    const update = { ...settingsData };

    if (type === 'instructor') {
      query.instructorId = id;
      update.instructorId = id;
    } else if (type === 'class') {
      query.classId = id;
      update.classId = id;
    } else if (type === 'session') {
      query.sessionId = id;
      update.sessionId = id;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid type. Must be: instructor, class, or session'
      });
    }

    const settings = await GamificationSettings.findOneAndUpdate(
      query,
      update,
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    console.log(`[Gamification] Settings updated successfully`);

    res.json({
      success: true,
      settings
    });

  } catch (error) {
    console.error('[Gamification] Error updating settings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get what a student can see based on settings
router.get('/settings/:type/:id/student-view', async (req, res) => {
  try {
    const { type, id } = req.params;

    const query = {};
    if (type === 'instructor') query.instructorId = id;
    else if (type === 'class') query.classId = id;
    else if (type === 'session') query.sessionId = id;

    let settings = await GamificationSettings.findOne(query);

    if (!settings) {
      settings = GamificationSettings.getDefaultSettings();
    }

    // Return only visibility settings (what student can see)
    res.json({
      success: true,
      visibility: settings.visibility || GamificationSettings.getDefaultSettings().visibility
    });

  } catch (error) {
    console.error('[Gamification] Error fetching student view settings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Quick toggle specific visibility setting
router.patch('/settings/:type/:id/visibility/:feature', async (req, res) => {
  try {
    const { type, id, feature } = req.params;
    const { enabled } = req.body;

    console.log(`[Gamification] Toggling ${feature} to ${enabled} for ${type}: ${id}`);

    const query = {};
    if (type === 'instructor') query.instructorId = id;
    else if (type === 'class') query.classId = id;
    else if (type === 'session') query.sessionId = id;

    const update = {};
    update[`visibility.${feature}`] = enabled;

    const settings = await GamificationSettings.findOneAndUpdate(
      query,
      update,
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    res.json({
      success: true,
      feature,
      enabled,
      settings: settings.visibility
    });

  } catch (error) {
    console.error('[Gamification] Error toggling visibility:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get default settings (for reference)
router.get('/settings/defaults', (req, res) => {
  res.json({
    success: true,
    settings: GamificationSettings.getDefaultSettings()
  });
});

// Delete a single player
router.delete('/player/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;
    console.log(`[Gamification] Deleting player: ${playerId}`);

    const result = await GamificationPlayer.deleteOne({ playerId });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      });
    }

    console.log(`[Gamification] Player deleted successfully`);

    res.json({
      success: true,
      message: 'Player deleted successfully'
    });

  } catch (error) {
    console.error('[Gamification] Error deleting player:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Cleanup duplicate players (keep only players with studentId)
router.post('/cleanup-duplicates', async (req, res) => {
  try {
    console.log(`[Gamification] Cleaning up duplicate players...`);

    // Find all players with null studentId
    const duplicates = await GamificationPlayer.find({
      $or: [
        { studentId: null },
        { studentId: { $exists: false } }
      ]
    });

    console.log(`[Gamification] Found ${duplicates.length} players without studentId`);

    // Extract player IDs before deletion (for returning to client)
    const deletedPlayerIds = duplicates.map(p => p.playerId);

    // Delete players without studentId
    const result = await GamificationPlayer.deleteMany({
      $or: [
        { studentId: null },
        { studentId: { $exists: false } }
      ]
    });

    console.log(`[Gamification] Deleted ${result.deletedCount} duplicate players`);

    // Get remaining player count
    const remainingCount = await GamificationPlayer.countDocuments();

    res.json({
      success: true,
      deletedCount: result.deletedCount,
      remainingPlayers: remainingCount,
      deletedPlayerIds: deletedPlayerIds,
      message: `Cleaned up ${result.deletedCount} duplicate players`
    });

  } catch (error) {
    console.error('[Gamification] Error cleaning up duplicates:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get leaderboard for instructor (all classes)
router.get('/leaderboard/instructor/:instructorId', async (req, res) => {
  try {
    const { instructorId } = req.params;
    const { classId } = req.query;

    console.log(`[Gamification] Fetching leaderboard for instructor: ${instructorId}${classId ? `, class: ${classId}` : ''}`);

    // Build query
    let query = { instructorId };
    if (classId) {
      query.classId = classId;
    }

    // Get all players for this instructor
    const players = await GamificationPlayer.find(query)
      .sort({ totalPoints: -1 })
      .limit(100);

    console.log(`[Gamification] Found ${players.length} players`);

    // Format leaderboard data
    const leaderboard = players.map(player => ({
      playerId: player.playerId,
      name: player.name || 'Student',
      totalPoints: player.totalPoints || 0,
      level: player.level || 1,
      achievementCount: player.achievements?.length || 0,
      experiencePoints: player.experience || 0,
      nextLevelXP: calculateNextLevelXP(player.level || 1)
    }));

    res.json({
      success: true,
      leaderboard
    });

  } catch (error) {
    console.error('[Gamification] Error fetching leaderboard:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get leaderboard for specific class
router.get('/leaderboard/class/:classId', async (req, res) => {
  try {
    const { classId } = req.params;

    console.log(`[Gamification] Fetching leaderboard for class: ${classId}`);

    const players = await GamificationPlayer.find({ classId })
      .sort({ totalPoints: -1 })
      .limit(100);

    console.log(`[Gamification] Found ${players.length} players`);

    const leaderboard = players.map(player => ({
      playerId: player.playerId,
      name: player.name || 'Student',
      totalPoints: player.totalPoints || 0,
      level: player.level || 1,
      achievementCount: player.achievements?.length || 0
    }));

    res.json({
      success: true,
      leaderboard
    });

  } catch (error) {
    console.error('[Gamification] Error fetching class leaderboard:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get recent achievements
router.get('/achievements/recent', async (req, res) => {
  try {
    const { instructorId, classId, limit = 10 } = req.query;

    console.log(`[Gamification] Fetching recent achievements`);

    // Build query
    let query = {};
    if (instructorId) query.instructorId = instructorId;
    if (classId) query.classId = classId;

    // Find players with achievements
    const players = await GamificationPlayer.find({
      ...query,
      'achievements.0': { $exists: true }
    }).limit(50);

    // Extract and sort achievements
    const allAchievements = [];
    players.forEach(player => {
      player.achievements?.forEach(ach => {
        allAchievements.push({
          ...ach.toObject(),
          studentName: player.name || 'Student',
          playerId: player.playerId
        });
      });
    });

    // Sort by unlock date and limit
    allAchievements.sort((a, b) =>
      new Date(b.unlockedAt) - new Date(a.unlockedAt)
    );

    const recentAchievements = allAchievements.slice(0, parseInt(limit));

    res.json({
      success: true,
      achievements: recentAchievements
    });

  } catch (error) {
    console.error('[Gamification] Error fetching recent achievements:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get available achievements
router.get('/achievements/available', async (req, res) => {
  try {
    console.log(`[Gamification] Fetching available achievements`);

    // Return predefined achievements
    const achievements = [
      {
        id: 'first_answer',
        name: 'First Answer',
        description: 'Answer your first question',
        icon: '🎯',
        color: '#4F46E5'
      },
      {
        id: 'perfect_score',
        name: 'Perfect Score',
        description: 'Get all questions correct in a session',
        icon: '💯',
        color: '#10B981'
      },
      {
        id: 'speed_demon',
        name: 'Speed Demon',
        description: 'Answer within 3 seconds 10 times',
        icon: '⚡',
        color: '#F59E0B'
      },
      {
        id: 'consistent',
        name: 'Consistent',
        description: 'Maintain a 5-question streak',
        icon: '🔥',
        color: '#EF4444'
      },
      {
        id: 'team_player',
        name: 'Team Player',
        description: 'Participate in 10 sessions',
        icon: '🤝',
        color: '#8B5CF6'
      },
      {
        id: 'knowledge_master',
        name: 'Knowledge Master',
        description: 'Reach level 10',
        icon: '🧠',
        color: '#EC4899'
      }
    ];

    res.json({
      success: true,
      achievements
    });

  } catch (error) {
    console.error('[Gamification] Error fetching available achievements:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Sync session data to gamification system
router.post('/sync-session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const Session = require('../models/Session');

    console.log(`[Gamification] Syncing session ${sessionId} to gamification system`);

    // Load session
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const { instructorId, classId, participants = [], responses = [], questions = [] } = session;

    if (!classId) {
      return res.status(400).json({
        success: false,
        error: 'Session must be linked to a class for gamification'
      });
    }

    // Group responses by participant
    const participantStats = new Map();

    responses.forEach(response => {
      const participantId = response.participantId;
      if (!participantId) return;

      if (!participantStats.has(participantId)) {
        const participant = participants.find(p => p.participantId === participantId);
        participantStats.set(participantId, {
          name: participant?.name || 'Student',
          totalPoints: 0,
          correctAnswers: 0,
          questionsAnswered: 0,
          responses: []
        });
      }

      const stats = participantStats.get(participantId);
      stats.questionsAnswered++;

      // Calculate points for this response
      let points = response.points || response.score;

      // If no points field, calculate from correctness
      if (points === undefined || points === null) {
        const isCorrect = String(response.answer).toLowerCase().trim() ===
                         String(response.correctAnswer).toLowerCase().trim();
        points = isCorrect ? 10 : 0; // Award 10 points for correct answers
      }

      stats.totalPoints += points;

      if (points > 0) {
        stats.correctAnswers++;
      }

      stats.responses.push(response);
    });

    // Create or update GamificationPlayer records
    const syncResults = [];

    for (const [participantId, stats] of participantStats) {
      // Find or create player
      let player = await GamificationPlayer.findOne({ playerId: participantId });

      if (!player) {
        player = new GamificationPlayer({
          playerId: participantId,
          name: stats.name,
          instructorId,
          classId,
          level: 1,
          totalPoints: 0,
          experience: 0,
          stats: {
            questionsAnswered: 0,
            correctAnswers: 0,
            accuracy: 0,
            bestStreak: 0,
            currentStreak: 0
          },
          achievements: [],
          badges: []
        });
      }

      // Update stats
      player.totalPoints += stats.totalPoints;
      player.experience += stats.totalPoints;
      player.stats.questionsAnswered += stats.questionsAnswered;
      player.stats.correctAnswers += stats.correctAnswers;

      // Recalculate accuracy
      if (player.stats.questionsAnswered > 0) {
        player.stats.accuracy = Math.round((player.stats.correctAnswers / player.stats.questionsAnswered) * 100);
      }

      // Calculate level based on total points
      player.level = calculateLevel(player.totalPoints);

      // Ensure instructorId and classId are set
      if (!player.instructorId) player.instructorId = instructorId;
      if (!player.classId) player.classId = classId;

      player.lastActive = new Date();

      await player.save();

      syncResults.push({
        participantId,
        name: player.name,
        pointsAdded: stats.totalPoints,
        newTotalPoints: player.totalPoints,
        newLevel: player.level
      });
    }

    console.log(`[Gamification] Synced ${syncResults.length} players from session ${sessionId}`);

    res.json({
      success: true,
      message: `Synced ${syncResults.length} players`,
      sessionId,
      results: syncResults
    });

  } catch (error) {
    console.error('[Gamification] Error syncing session:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Sync all sessions for an instructor
router.post('/sync-instructor-sessions/:instructorId', async (req, res) => {
  try {
    const { instructorId } = req.params;
    const { days = 30, classId } = req.query;
    const Session = require('../models/Session');

    console.log(`[Gamification] Syncing sessions for instructor ${instructorId}`);

    // Find sessions from the last N days
    const since = new Date();
    since.setDate(since.getDate() - days);

    const query = {
      instructorId,
      createdAt: { $gte: since },
      responses: { $exists: true, $ne: [] }
    };

    if (classId) {
      query.classId = classId;
    }

    const sessions = await Session.find(query);

    console.log(`[Gamification] Found ${sessions.length} sessions to sync`);

    const allResults = [];
    let totalPlayersSynced = 0;

    for (const session of sessions) {
      const { participants = [], responses = [] } = session;

      if (!session.classId) continue;

      // Group responses by participant
      const participantStats = new Map();

      responses.forEach(response => {
        const participantId = response.participantId;
        if (!participantId) return;

        if (!participantStats.has(participantId)) {
          const participant = participants.find(p => p.participantId === participantId);
          participantStats.set(participantId, {
            name: participant?.name || 'Student',
            totalPoints: 0,
            correctAnswers: 0,
            questionsAnswered: 0
          });
        }

        const stats = participantStats.get(participantId);
        stats.questionsAnswered++;

        // Calculate points for this response
        let points = response.points || response.score;

        // If no points field, calculate from correctness
        if (points === undefined || points === null) {
          const isCorrect = String(response.answer).toLowerCase().trim() ===
                           String(response.correctAnswer).toLowerCase().trim();
          points = isCorrect ? 10 : 0; // Award 10 points for correct answers
        }

        stats.totalPoints += points;

        if (points > 0) {
          stats.correctAnswers++;
        }
      });

      // Update players
      for (const [participantId, stats] of participantStats) {
        let player = await GamificationPlayer.findOne({ playerId: participantId });

        if (!player) {
          player = new GamificationPlayer({
            playerId: participantId,
            name: stats.name,
            instructorId: session.instructorId,
            classId: session.classId,
            level: 1,
            totalPoints: 0,
            experience: 0,
            stats: {
              questionsAnswered: 0,
              correctAnswers: 0,
              accuracy: 0,
              bestStreak: 0,
              currentStreak: 0
            }
          });
        }

        // Always update instructorId and classId (in case they were missing or wrong)
        if (!player.instructorId) player.instructorId = session.instructorId;
        if (!player.classId) player.classId = session.classId;

        player.totalPoints += stats.totalPoints;
        player.experience += stats.totalPoints;
        player.stats.questionsAnswered += stats.questionsAnswered;
        player.stats.correctAnswers += stats.correctAnswers;

        if (player.stats.questionsAnswered > 0) {
          player.stats.accuracy = Math.round((player.stats.correctAnswers / player.stats.questionsAnswered) * 100);
        }

        player.level = calculateLevel(player.totalPoints);
        player.lastActive = new Date();

        await player.save();
        totalPlayersSynced++;
      }

      allResults.push({
        sessionId: session._id,
        sessionCode: session.sessionCode,
        playersSynced: participantStats.size
      });
    }

    console.log(`[Gamification] Synced ${totalPlayersSynced} player records from ${sessions.length} sessions`);

    res.json({
      success: true,
      message: `Synced ${totalPlayersSynced} players from ${sessions.length} sessions`,
      sessionsSynced: sessions.length,
      totalPlayersSynced,
      sessions: allResults
    });

  } catch (error) {
    console.error('[Gamification] Error syncing instructor sessions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Fix instructorId for all players in a class
router.post('/fix-instructor-id/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    const { correctInstructorId } = req.body;

    if (!correctInstructorId) {
      return res.status(400).json({
        success: false,
        error: 'correctInstructorId is required in request body'
      });
    }

    console.log(`[Gamification] Fixing instructorId for class ${classId} to ${correctInstructorId}`);

    // Update all players in this class
    const result = await GamificationPlayer.updateMany(
      { classId },
      { $set: { instructorId: correctInstructorId } }
    );

    console.log(`[Gamification] Updated ${result.modifiedCount} players`);

    res.json({
      success: true,
      message: `Updated instructorId for ${result.modifiedCount} players`,
      modifiedCount: result.modifiedCount
    });

  } catch (error) {
    console.error('[Gamification] Error fixing instructorId:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper function to calculate level from total points
function calculateLevel(totalPoints) {
  // Level formula: level = 1 + floor(sqrt(points / 100))
  // This means: Level 1 = 0-99 points, Level 2 = 100-399, Level 3 = 400-899, etc.
  const level = 1 + Math.floor(Math.sqrt(totalPoints / 100));
  return Math.max(1, level);
}

// Helper function to calculate next level XP
function calculateNextLevelXP(level) {
  const baseXP = 100;
  const multiplier = 1.5;
  return Math.floor(baseXP * Math.pow(multiplier, level - 1));
}

module.exports = router;

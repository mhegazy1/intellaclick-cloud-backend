/**
 * Gamification API Routes
 * Handles student gamification data (points, levels, achievements, leaderboards)
 */

const express = require('express');
const router = express.Router();
const GamificationPlayer = require('../models/GamificationPlayer');
const GamificationSettings = require('../models/GamificationSettings');

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
    const limit = parseInt(req.query.limit) || 10;
    const sortBy = req.query.sortBy || 'totalPoints';

    console.log(`[Gamification] Fetching leaderboard for roster: ${rosterId}`);

    const sortField = {};
    sortField[sortBy] = -1;

    const players = await GamificationPlayer
      .find({ rosterId })
      .sort(sortField)
      .limit(limit)
      .select('playerId name avatar level totalPoints stats.accuracy stats.bestStreak');

    res.json({
      success: true,
      leaderboard: players,
      count: players.length
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

    // Count players with more points in the same roster
    const rank = await GamificationPlayer.countDocuments({
      rosterId,
      totalPoints: { $gt: player.totalPoints }
    }) + 1;

    const totalPlayers = await GamificationPlayer.countDocuments({ rosterId });

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

    const players = await GamificationPlayer.find({ rosterId });

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

module.exports = router;

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ClickerResultsService = require('../services/clickerResultsService');
const Session = require('../models/Session');

/**
 * Sync clicker session results from desktop app
 * This endpoint is called when a clicker session ends in the desktop app
 */
router.post('/sync-session-results', auth, async (req, res) => {
  try {
    const {
      sessionCode,
      sessionId,
      platform,
      classId,
      startTime,
      endTime,
      questions,
      participants,
      responses,
      metadata
    } = req.body;
    
    const instructorId = req.user._id || req.user.userId;
    
    // Validate required fields
    if (!sessionCode && !sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session code or ID is required'
      });
    }
    
    // Process the results
    const result = await ClickerResultsService.processClickerResults({
      sessionId,
      sessionCode,
      platform: platform || 'desktop',
      classId,
      instructorId,
      startTime: startTime ? new Date(startTime) : null,
      endTime: endTime ? new Date(endTime) : new Date(),
      questions: questions || [],
      participants: participants || [],
      responses: responses || [],
      metadata: metadata || {}
    });
    
    if (!result.success) {
      return res.status(500).json(result);
    }
    
    res.json({
      success: true,
      message: 'Session results synced successfully',
      sessionId: result.sessionId,
      analytics: result.analytics,
      gamificationProcessed: result.gamificationResults.length > 0
    });
    
  } catch (error) {
    console.error('Error syncing session results:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync session results'
    });
  }
});

/**
 * Get session results for display in instructor portal
 */
router.get('/session-results/:sessionId', auth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const instructorId = req.user._id || req.user.userId;
    
    const results = await ClickerResultsService.getSessionResultsForInstructor(
      sessionId,
      instructorId
    );
    
    res.json({
      success: true,
      ...results
    });
    
  } catch (error) {
    console.error('Error fetching session results:', error);
    
    if (error.message === 'Access denied') {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to view these results'
      });
    }
    
    if (error.message === 'Session not found') {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch session results'
    });
  }
});

/**
 * Get all sessions for a class (for instructor portal)
 */
router.get('/class-sessions/:classId', auth, async (req, res) => {
  try {
    const { classId } = req.params;
    const { 
      platform, 
      startDate, 
      endDate, 
      limit = 20, 
      offset = 0 
    } = req.query;
    
    // Build query
    const query = { classId };
    
    if (platform) {
      query['metadata.platform'] = platform;
    }
    
    if (startDate || endDate) {
      query.endedAt = {};
      if (startDate) query.endedAt.$gte = new Date(startDate);
      if (endDate) query.endedAt.$lte = new Date(endDate);
    }
    
    // Get sessions
    const sessions = await Session.find(query)
      .sort({ endedAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .select('sessionCode title status startedAt endedAt metadata participants responses totalQuestions');
    
    // Get total count
    const totalCount = await Session.countDocuments(query);
    
    // Calculate basic stats for each session
    const sessionsWithStats = sessions.map(session => {
      const participantCount = session.participants.length;
      const responseCount = session.responses.length;
      const questionCount = session.totalQuestions || 0;
      
      return {
        id: session._id,
        code: session.sessionCode,
        title: session.title,
        platform: session.metadata?.platform || 'unknown',
        startTime: session.startedAt,
        endTime: session.endedAt,
        duration: session.endedAt ? 
          Math.round((session.endedAt - session.startedAt) / 1000 / 60) : 0, // minutes
        stats: {
          participants: participantCount,
          questions: questionCount,
          responses: responseCount,
          responseRate: questionCount > 0 && participantCount > 0 ?
            Math.round(responseCount / (questionCount * participantCount) * 100) : 0
        }
      };
    });
    
    res.json({
      success: true,
      sessions: sessionsWithStats,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: offset + sessions.length < totalCount
      }
    });
    
  } catch (error) {
    console.error('Error fetching class sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sessions'
    });
  }
});

/**
 * Batch sync multiple sessions (for offline desktop app catching up)
 */
router.post('/batch-sync-sessions', auth, async (req, res) => {
  try {
    const { sessions } = req.body;
    const instructorId = req.user._id || req.user.userId;
    
    if (!Array.isArray(sessions)) {
      return res.status(400).json({
        success: false,
        error: 'Sessions array is required'
      });
    }
    
    const results = [];
    const errors = [];
    
    // Process each session
    for (const sessionData of sessions) {
      try {
        const result = await ClickerResultsService.processClickerResults({
          ...sessionData,
          instructorId
        });
        
        results.push({
          sessionCode: sessionData.sessionCode,
          success: result.success,
          sessionId: result.sessionId
        });
        
      } catch (error) {
        errors.push({
          sessionCode: sessionData.sessionCode,
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      message: `Processed ${results.length} sessions`,
      results,
      errors,
      summary: {
        total: sessions.length,
        successful: results.filter(r => r.success).length,
        failed: errors.length
      }
    });
    
  } catch (error) {
    console.error('Error in batch sync:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process batch sync'
    });
  }
});

module.exports = router;
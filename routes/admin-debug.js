/**
 * Debug endpoint to inspect session responses
 */

const express = require('express');
const router = express.Router();
const Session = require('../models/Session');

/**
 * Check session responses to see if they have userId
 * GET /api/admin-debug/check-responses?secret=BACKFILL2025
 */
router.get('/check-responses', async (req, res) => {
  try {
    if (req.query.secret !== 'BACKFILL2025') {
      return res.status(403).json({ success: false, error: 'Invalid secret' });
    }

    // Get a few recent sessions with responses
    const sessions = await Session.find({ 'responses.0': { $exists: true } })
      .limit(5)
      .sort({ createdAt: -1 });

    const analysis = {
      totalSessions: sessions.length,
      sessions: []
    };

    for (const session of sessions) {
      const sessionInfo = {
        sessionCode: session.sessionCode,
        title: session.title,
        totalResponses: session.responses.length,
        responsesWithUserId: 0,
        responsesWithParticipantId: 0,
        responsesWithAnswer: 0,
        sampleResponses: []
      };

      session.responses.forEach((response, idx) => {
        if (response.userId) sessionInfo.responsesWithUserId++;
        if (response.participantId) sessionInfo.responsesWithParticipantId++;
        if (response.answer !== null && response.answer !== undefined) sessionInfo.responsesWithAnswer++;

        // Include first 3 responses as samples
        if (idx < 3) {
          sessionInfo.sampleResponses.push({
            hasUserId: !!response.userId,
            userId: response.userId ? response.userId.toString() : null,
            hasParticipantId: !!response.participantId,
            participantId: response.participantId,
            hasAnswer: response.answer !== null && response.answer !== undefined,
            answer: response.answer,
            submittedAt: response.submittedAt
          });
        }
      });

      analysis.sessions.push(sessionInfo);
    }

    res.json({
      success: true,
      analysis
    });

  } catch (error) {
    console.error('[Debug] Error checking responses:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Test sessions endpoint
 * GET /api/admin-debug/test-sessions/:classId?secret=BACKFILL2025
 */
router.get('/test-sessions/:classId', async (req, res) => {
  try {
    if (req.query.secret !== 'BACKFILL2025') {
      return res.status(403).json({ success: false, error: 'Invalid secret' });
    }

    const Session = require('../models/Session');
    const { classId } = req.params;

    const sessions = await Session.find({ classId })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      classId,
      totalSessions: sessions.length,
      sessions: sessions.map(s => ({
        _id: s._id,
        code: s.sessionCode,
        title: s.title,
        status: s.status,
        participants: s.participants.length,
        responses: s.responses.length,
        createdAt: s.createdAt
      }))
    });

  } catch (error) {
    console.error('[Debug] Error testing sessions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

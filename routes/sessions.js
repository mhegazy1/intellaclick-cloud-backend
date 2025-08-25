const express = require('express');
const router = express.Router();
const Session = require('../models/Session');
const auth = require('../middleware/auth');

// Create a test session (for development)
router.post('/test', async (req, res) => {
  try {
    const { sessionCode, title, description } = req.body;
    
    // For test sessions, use a default instructor ID if not authenticated
    const instructorId = req.user?.id || '507f1f77bcf86cd799439011'; // MongoDB ObjectId format
    
    // Check if session code already exists
    const existingSession = await Session.findOne({ sessionCode });
    if (existingSession) {
      return res.status(400).json({ 
        success: false, 
        error: 'Session code already exists' 
      });
    }
    
    // Create new session
    const session = new Session({
      sessionCode,
      title: title || 'Test Session',
      description: description || 'Created from desktop app',
      instructorId,
      status: 'waiting'
    });
    
    await session.save();
    
    // Return session info with public URL
    res.json({
      success: true,
      session: {
        id: session._id,
        sessionCode: session.sessionCode,
        title: session.title,
        status: session.status,
        publicUrl: `https://join.intellaclick.com/session/${session.sessionCode}`
      }
    });
    
  } catch (error) {
    console.error('Error creating test session:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Create a real session (requires authentication)
router.post('/', auth, async (req, res) => {
  try {
    const { sessionCode, title, description } = req.body;
    
    // Check if session code already exists
    const existingSession = await Session.findOne({ sessionCode });
    if (existingSession) {
      return res.status(400).json({ 
        success: false, 
        error: 'Session code already exists' 
      });
    }
    
    // Create new session
    const session = new Session({
      sessionCode,
      title,
      description,
      instructorId: req.user.id,
      status: 'waiting'
    });
    
    await session.save();
    
    res.json({
      success: true,
      session: {
        id: session._id,
        sessionCode: session.sessionCode,
        title: session.title,
        status: session.status,
        publicUrl: `https://join.intellaclick.com/session/${session.sessionCode}`
      }
    });
    
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get session by code
router.get('/code/:sessionCode', async (req, res) => {
  try {
    const session = await Session.findOne({ 
      sessionCode: req.params.sessionCode.toUpperCase() 
    });
    
    if (!session) {
      return res.status(404).json({ 
        success: false, 
        error: 'Session not found' 
      });
    }
    
    res.json({
      success: true,
      session: {
        id: session._id,
        sessionCode: session.sessionCode,
        title: session.title,
        status: session.status,
        currentQuestion: session.currentQuestion,
        participantCount: session.participants.length
      }
    });
    
  } catch (error) {
    console.error('Error getting session:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Join session as participant
router.post('/join', async (req, res) => {
  try {
    const { sessionCode, name, userId } = req.body;
    
    const session = await Session.findOne({ 
      sessionCode: sessionCode.toUpperCase() 
    });
    
    if (!session) {
      return res.status(404).json({ 
        success: false, 
        error: 'Session not found' 
      });
    }
    
    if (session.status === 'ended') {
      return res.status(400).json({ 
        success: false, 
        error: 'Session has ended' 
      });
    }
    
    // Generate participant ID
    const participantId = `P${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
    
    // Add participant to session
    session.participants.push({
      userId: userId || null,
      participantId,
      name: name || 'Anonymous',
      joinedAt: new Date()
    });
    
    await session.save();
    
    res.json({
      success: true,
      participantId,
      session: {
        id: session._id,
        sessionCode: session.sessionCode,
        title: session.title,
        status: session.status,
        currentQuestion: session.currentQuestion
      }
    });
    
  } catch (error) {
    console.error('Error joining session:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Update session status
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    
    const session = await Session.findOne({ 
      _id: req.params.id,
      instructorId: req.user.id 
    });
    
    if (!session) {
      return res.status(404).json({ 
        success: false, 
        error: 'Session not found or unauthorized' 
      });
    }
    
    session.status = status;
    
    if (status === 'active' && !session.startedAt) {
      session.startedAt = new Date();
    } else if (status === 'ended' && !session.endedAt) {
      session.endedAt = new Date();
    }
    
    await session.save();
    
    res.json({
      success: true,
      session: {
        id: session._id,
        status: session.status,
        startedAt: session.startedAt,
        endedAt: session.endedAt
      }
    });
    
  } catch (error) {
    console.error('Error updating session status:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get all sessions for instructor
router.get('/', auth, async (req, res) => {
  try {
    const sessions = await Session.find({ 
      instructorId: req.user.id 
    }).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      sessions: sessions.map(s => ({
        id: s._id,
        sessionCode: s.sessionCode,
        title: s.title,
        status: s.status,
        participantCount: s.participants.length,
        responseCount: s.responses.length,
        createdAt: s.createdAt,
        startedAt: s.startedAt,
        endedAt: s.endedAt
      }))
    });
    
  } catch (error) {
    console.error('Error getting sessions:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;
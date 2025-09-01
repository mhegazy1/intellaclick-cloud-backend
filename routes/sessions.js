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
      instructorId: req.user.userId || req.user.id, // Handle both token formats
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

// Get participants for a session
router.get('/:id/participants', auth, async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    res.json({
      success: true,
      participants: session.participants,
      count: session.participants.length
    });
    
  } catch (error) {
    console.error('Get participants error:', error);
    res.status(500).json({ success: false, error: error.message });
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
    console.log('[Sessions] Join request:', { sessionCode, name, userId });
    
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
    
    // Initialize participants array if it doesn't exist
    if (!session.participants) {
      session.participants = [];
    }
    
    console.log('[Sessions] Current participants before adding:', session.participants.length);
    
    // Add participant to session
    session.participants.push({
      userId: userId || null,
      participantId,
      name: name || 'Anonymous',
      joinedAt: new Date()
    });
    
    console.log('[Sessions] Saving session with new participant');
    await session.save();
    
    // Verify the save worked
    const updatedSession = await Session.findById(session._id);
    console.log('[Sessions] Session after join:', {
      participantCount: updatedSession.participants?.length || 0,
      lastParticipant: updatedSession.participants?.[updatedSession.participants.length - 1]
    });
    
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
      instructorId: req.user.userId || req.user.id 
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
      instructorId: req.user.userId || req.user.id 
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

// Get active session for a participant
router.get('/active', auth, async (req, res) => {
  try {
    // Find session where user is a participant
    const session = await Session.findOne({
      'participants.userId': req.user.userId,
      status: { $in: ['waiting', 'active'] }
    });
    
    if (!session) {
      return res.json({ session: null });
    }
    
    res.json({ session });
  } catch (error) {
    console.error('Error getting active session:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get current question for a session by code (for students)
router.get('/code/:sessionCode/current-question', async (req, res) => {
  try {
    const session = await Session.findOne({ 
      sessionCode: req.params.sessionCode.toUpperCase() 
    });
    
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    // Transform currentQuestion to match frontend expectations
    let question = null;
    if (session.currentQuestion && session.currentQuestion.questionText) {
      question = {
        id: session.currentQuestion.questionId,
        sessionId: session._id,
        questionText: session.currentQuestion.questionText,  // Changed from 'text' to 'questionText'
        type: session.currentQuestion.questionType,
        options: session.currentQuestion.options.map((opt, idx) => ({
          id: String.fromCharCode(65 + idx), // A, B, C, D
          text: opt
        })),
        points: session.currentQuestion.points || 10,
        timeLimit: session.currentQuestion.timeLimit || 30,
        startedAt: session.currentQuestion.startedAt
      };
    }
    
    res.json({ 
      success: true, 
      question,
      sessionStatus: session.status
    });
    
  } catch (error) {
    console.error('Get current question error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get current question for a session
router.get('/:id/current-question', auth, async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    // Transform currentQuestion to match frontend expectations
    let question = null;
    if (session.currentQuestion) {
      question = {
        id: session.currentQuestion.questionId,
        sessionId: session._id,
        text: session.currentQuestion.questionText,
        type: session.currentQuestion.questionType,
        options: session.currentQuestion.options.map((opt, idx) => ({
          id: String.fromCharCode(65 + idx), // A, B, C, D
          text: opt
        })),
        points: 10,
        timeLimit: 30,
        startedAt: session.currentQuestion.startedAt
      };
    }
    
    res.json({ 
      success: true, 
      question,
      questionIndex: session.currentQuestionIndex || 0
    });
  } catch (error) {
    console.error('Error getting current question:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Submit response to a question
router.post('/:id/questions/:questionId/respond', auth, async (req, res) => {
  try {
    const { answer, timeSpent } = req.body;
    const session = await Session.findById(req.params.id);
    
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    // Store response
    const response = {
      userId: req.user.userId,
      questionId: req.params.questionId,
      answer,
      timeSpent,
      timestamp: new Date()
    };
    
    session.responses.push(response);
    await session.save();
    
    res.json({ 
      success: true, 
      message: 'Response recorded',
      responseId: response._id
    });
  } catch (error) {
    console.error('Error submitting response:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Leave a session
router.post('/:id/leave', auth, async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    // Remove participant
    session.participants = session.participants.filter(
      p => p.userId !== req.user.userId
    );
    
    await session.save();
    
    res.json({ success: true, message: 'Left session successfully' });
  } catch (error) {
    console.error('Error leaving session:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send question to session (from desktop app)
router.post('/:id/questions', auth, async (req, res) => {
  try {
    console.log('[Sessions] Sending question to session:', req.params.id);
    const session = await Session.findById(req.params.id);
    
    if (!session) {
      console.error('[Sessions] Session not found:', req.params.id);
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    console.log('[Sessions] Found session:', { 
      id: session._id, 
      code: session.sessionCode, 
      status: session.status,
      participantCount: session.participants?.length || 0
    });
    
    // Verify the instructor owns this session
    if (session.instructorId.toString() !== (req.user.userId || req.user.id)) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    
    const { questionId, questionText, questionType, options, correctAnswer, points, timeLimit } = req.body;
    
    // Create question object
    const question = {
      questionId: questionId || `Q${Date.now()}`,
      questionText,
      questionType,
      options,
      correctAnswer,
      points: points || 10,
      timeLimit: timeLimit || 30,
      startedAt: new Date()
    };
    
    // Set as current question
    session.currentQuestion = question;
    session.currentQuestionIndex = (session.currentQuestionIndex || 0) + 1;
    
    // Update session status if needed
    if (session.status === 'waiting') {
      console.log('[Sessions] Updating session status from waiting to active');
      session.status = 'active';
      session.startedAt = new Date();
    }
    
    console.log('[Sessions] Saving session with question:', {
      questionId: question.questionId,
      sessionStatus: session.status
    });
    
    await session.save();
    
    // Verify the save worked
    const savedSession = await Session.findById(session._id);
    console.log('[Sessions] Session after save:', {
      status: savedSession.status,
      hasCurrentQuestion: !!savedSession.currentQuestion,
      questionId: savedSession.currentQuestion?.questionId
    });
    
    res.json({
      success: true,
      message: 'Question sent successfully',
      question
    });
    
  } catch (error) {
    console.error('Error sending question:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// End current question
router.post('/:id/questions/:questionId/end', auth, async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    // Verify the instructor owns this session
    if (session.instructorId.toString() !== (req.user.userId || req.user.id)) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    
    // Clear current question
    session.currentQuestion = null;
    await session.save();
    
    res.json({
      success: true,
      message: 'Question ended'
    });
    
  } catch (error) {
    console.error('Error ending question:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get participants by session code (for desktop app polling)
router.get('/code/:sessionCode/participants', async (req, res) => {
  try {
    const session = await Session.findOne({ 
      sessionCode: req.params.sessionCode.toUpperCase() 
    });
    
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    res.json({
      success: true,
      participants: session.participants,
      count: session.participants.length
    });
    
  } catch (error) {
    console.error('Get participants error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get responses for a session by code (for instructors)
router.get('/code/:sessionCode/responses', async (req, res) => {
  try {
    const session = await Session.findOne({ 
      sessionCode: req.params.sessionCode.toUpperCase() 
    });
    
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    // Group responses by question
    const responsesByQuestion = {};
    session.responses.forEach(response => {
      const questionId = response.questionId;
      if (!responsesByQuestion[questionId]) {
        responsesByQuestion[questionId] = [];
      }
      responsesByQuestion[questionId].push({
        participantId: response.participantId,
        answer: response.answer,
        submittedAt: response.submittedAt
      });
    });
    
    res.json({
      success: true,
      responses: session.responses,
      responsesByQuestion,
      totalResponses: session.responses.length
    });
    
  } catch (error) {
    console.error('Get responses error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Submit response by session code (for students)
router.post('/code/:sessionCode/respond', async (req, res) => {
  try {
    const { questionId, answer, timeSpent, participantId } = req.body;
    console.log('[Sessions] Response submission:', {
      sessionCode: req.params.sessionCode,
      questionId,
      answer,
      participantId
    });
    
    const session = await Session.findOne({ 
      sessionCode: req.params.sessionCode.toUpperCase() 
    });
    
    if (!session) {
      console.error('[Sessions] Session not found for response:', req.params.sessionCode);
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    console.log('[Sessions] Found session for response:', {
      id: session._id,
      code: session.sessionCode,
      responseCount: session.responses?.length || 0
    });
    
    // Store response
    const response = {
      userId: req.user?.userId || null,  // Handle unauthenticated users
      participantId: req.body.participantId || `anon_${Date.now()}`,
      questionId,
      answer,
      submittedAt: new Date()
    };
    
    // Initialize responses array if it doesn't exist
    if (!session.responses) {
      session.responses = [];
    }
    
    console.log('[Sessions] Adding response to session');
    session.responses.push(response);
    
    console.log('[Sessions] Saving session with response');
    await session.save();
    
    // Verify the save worked
    const updatedSession = await Session.findById(session._id);
    console.log('[Sessions] Session after response save:', {
      responseCount: updatedSession.responses?.length || 0,
      lastResponse: updatedSession.responses?.[updatedSession.responses.length - 1]
    });
    
    // Get the last response which will have the generated _id
    const savedResponse = session.responses[session.responses.length - 1];
    
    res.json({ 
      success: true, 
      message: 'Response recorded',
      responseId: savedResponse._id
    });
  } catch (error) {
    console.error('Error submitting response:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
const express = require('express');
const router = express.Router();
const Session = require('../models/Session');
const auth = require('../middleware/auth');

// Debug middleware to log all requests to this router
router.use((req, res, next) => {
  console.log(`[Sessions Router] ${req.method} ${req.path} called`);
  if (req.method === 'POST') {
    console.log('[Sessions Router] POST body preview:', JSON.stringify(req.body).substring(0, 200));
  }
  next();
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    message: 'Sessions API is running',
    version: '2025-09-05-requireLogin-fix',
    debugEnabled: true
  });
});

// Test endpoint - returns hardcoded question
router.get('/test-question', (req, res) => {
  res.set({
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  
  res.json({
    success: true,
    question: {
      id: 'test-123',
      questionText: 'This is a test question',
      type: 'multiple_choice',
      options: [
        { id: 'A', text: 'Test Option A' },
        { id: 'B', text: 'Test Option B' }
      ]
    }
  });
});

// Debug endpoint to check PS32NM session
router.get('/debug-ps32nm', async (req, res) => {
  try {
    console.log('[Sessions] Checking PS32NM session...');
    
    const sessions = await Session.find({ sessionCode: 'PS32NM' });
    
    if (sessions.length === 0) {
      return res.json({
        success: true,
        found: false,
        message: 'No session found with code PS32NM'
      });
    }
    
    const sessionDetails = sessions.map(session => ({
      id: session._id,
      sessionCode: session.sessionCode,
      title: session.title,
      requireLogin: session.requireLogin,
      status: session.status,
      created: session.createdAt,
      updated: session.updatedAt,
      participants: session.participants?.length || 0,
      responses: session.responses?.length || 0
    }));
    
    res.json({
      success: true,
      found: true,
      count: sessions.length,
      sessions: sessionDetails
    });
    
  } catch (error) {
    console.error('Error checking PS32NM session:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Create a test session (for development)
router.post('/test', async (req, res) => {
  console.log('[Sessions] POST /test endpoint called');
  console.log('[Sessions] Request body:', JSON.stringify(req.body, null, 2));
  console.log('[Sessions] Auth user:', req.user);
  
  try {
    const { sessionCode, title, description, requireLogin } = req.body;
    console.log('[Sessions] /test endpoint - requireLogin received:', requireLogin);
    
    // For test sessions, use a default instructor ID if not authenticated
    const instructorId = req.user?.id || '507f1f77bcf86cd799439011'; // MongoDB ObjectId format
    
    // Check if session code already exists
    const existingSession = await Session.findOne({ sessionCode });
    if (existingSession) {
      // If session is old (more than 12 hours) and not active, delete it
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
      if (existingSession.createdAt < twelveHoursAgo && existingSession.status !== 'active') {
        console.log(`[Sessions] Deleting old session with code ${sessionCode}`);
        await Session.deleteOne({ _id: existingSession._id });
      } else {
        return res.status(400).json({ 
          success: false, 
          error: 'Session code already exists' 
        });
      }
    }
    
    // Create new session
    const sessionData = {
      sessionCode,
      title: title || 'Test Session',
      description: description || 'Created from desktop app',
      instructorId,
      status: 'waiting'
    };
    
    // Explicitly set requireLogin with proper boolean conversion
    sessionData.requireLogin = requireLogin === true || requireLogin === 'true' || requireLogin === 1 || requireLogin === '1';
    
    console.log('[Sessions] Creating test session with data:', JSON.stringify(sessionData, null, 2));
    
    const session = new Session(sessionData);
    
    // Explicitly mark requireLogin as modified to ensure it's saved
    session.markModified('requireLogin');
    
    console.log('[Sessions] Session object before save:', {
      requireLogin: session.requireLogin,
      requireLoginType: typeof session.requireLogin,
      isModified: session.isModified('requireLogin')
    });
    
    await session.save();
    
    console.log('[Sessions] Test session saved with requireLogin:', session.requireLogin);
    
    // Verify the save by querying back
    const savedSession = await Session.findById(session._id);
    console.log('[Sessions] Verification after save:', {
      id: savedSession._id,
      requireLogin: savedSession.requireLogin,
      requireLoginInDB: 'requireLogin' in savedSession.toObject()
    });
    
    // Return session info with public URL
    res.json({
      success: true,
      session: {
        id: session._id,
        sessionCode: session.sessionCode,
        title: session.title,
        status: session.status,
        requireLogin: session.requireLogin,
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
    const { sessionCode, title, description, requireLogin, classId, rosterId, restrictToEnrolled, allowAnswerChange } = req.body;
    
    console.log('[Sessions] Create session request:');
    console.log('[Sessions] - sessionCode:', sessionCode);
    console.log('[Sessions] - title:', title);
    console.log('[Sessions] - requireLogin:', requireLogin);
    console.log('[Sessions] - classId:', classId);
    console.log('[Sessions] - restrictToEnrolled:', restrictToEnrolled);
    console.log('[Sessions] - allowAnswerChange:', allowAnswerChange);
    console.log('[Sessions] - User:', req.user);
    
    // Check if session code already exists
    const existingSession = await Session.findOne({ sessionCode });
    if (existingSession) {
      // If session is old (more than 12 hours) and not active, delete it
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
      if (existingSession.createdAt < twelveHoursAgo && existingSession.status !== 'active') {
        console.log(`[Sessions] Deleting old session with code ${sessionCode}`);
        await Session.deleteOne({ _id: existingSession._id });
      } else {
        return res.status(400).json({ 
          success: false, 
          error: 'Session code already exists' 
        });
      }
    }
    
    // Create new session
    const sessionData = {
      sessionCode,
      title,
      description,
      instructorId: req.user.userId || req.user.id, // Handle both token formats
      status: 'waiting',
      classId: classId || rosterId || null,  // Support both classId and rosterId
      rosterId: classId || rosterId || null   // Set both for compatibility
    };
    
    // Explicitly set requireLogin with proper boolean conversion
    sessionData.requireLogin = requireLogin === true || requireLogin === 'true' || requireLogin === 1 || requireLogin === '1';
    
    // Set restrictToEnrolled based on the provided setting
    // Note: restrictToEnrolled can be true even without a specific classId
    // This would restrict to students enrolled in ANY class
    if (restrictToEnrolled !== undefined) {
      sessionData.restrictToEnrolled = restrictToEnrolled === true || restrictToEnrolled === 'true' || restrictToEnrolled === 1 || restrictToEnrolled === '1';
    } else if (sessionData.classId) {
      // If a class is specified and restrictToEnrolled not explicitly set, default to true
      sessionData.restrictToEnrolled = true;
    } else {
      // If no class is specified and restrictToEnrolled not set, default to false
      sessionData.restrictToEnrolled = false;
    }
    
    // Set allowAnswerChange with proper boolean conversion
    sessionData.allowAnswerChange = allowAnswerChange === true || allowAnswerChange === 'true' || allowAnswerChange === 1 || allowAnswerChange === '1';
    
    console.log('[Sessions] Creating session with data:', JSON.stringify(sessionData, null, 2));
    
    const session = new Session(sessionData);
    
    // Explicitly mark requireLogin as modified to ensure it's saved
    session.markModified('requireLogin');
    
    console.log('[Sessions] Session object before save:', {
      requireLogin: session.requireLogin,
      requireLoginExists: 'requireLogin' in session,
      schemaHasRequireLogin: !!session.schema.paths.requireLogin,
      isModified: session.isModified('requireLogin')
    });
    
    await session.save();
    
    console.log('[Sessions] Session saved:');
    console.log('[Sessions] - ID:', session._id);
    console.log('[Sessions] - requireLogin in DB:', session.requireLogin);
    console.log('[Sessions] - requireLogin type:', typeof session.requireLogin);
    
    // Verify the save by querying back
    const savedSession = await Session.findById(session._id);
    console.log('[Sessions] Verification after save:', {
      id: savedSession._id,
      sessionCode: savedSession.sessionCode,
      requireLogin: savedSession.requireLogin,
      requireLoginInDB: 'requireLogin' in savedSession.toObject()
    });
    
    res.json({
      success: true,
      session: {
        id: session._id,
        sessionCode: session.sessionCode,
        title: session.title,
        status: session.status,
        requireLogin: session.requireLogin,
        restrictToEnrolled: session.restrictToEnrolled,
        allowAnswerChange: session.allowAnswerChange,
        classId: session.classId,
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

// Debug endpoint to check a specific session
router.get('/debug/:sessionCode', async (req, res) => {
  try {
    const session = await Session.findOne({ 
      sessionCode: req.params.sessionCode.toUpperCase() 
    });
    
    if (!session) {
      return res.json({ 
        found: false, 
        message: 'Session not found',
        searchedFor: req.params.sessionCode.toUpperCase()
      });
    }
    
    res.json({
      found: true,
      session: {
        id: session._id,
        sessionCode: session.sessionCode,
        title: session.title,
        requireLogin: session.requireLogin,
        requireLoginType: typeof session.requireLogin,
        requireLoginRaw: session.requireLogin,
        status: session.status,
        createdAt: session.createdAt,
        allFields: Object.keys(session.toObject())
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get session by code
router.get('/code/:sessionCode', async (req, res) => {
  // Prevent caching
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  
  try {
    const sessionCode = req.params.sessionCode.toUpperCase();
    
    // Find ALL sessions with this code (to handle duplicates)
    const sessions = await Session.find({ sessionCode });
    console.log(`[Sessions] Found ${sessions.length} sessions with code ${sessionCode}`);
    
    if (sessions.length > 1) {
      console.warn('[Sessions] DUPLICATE SESSIONS FOUND for stats!');
      sessions.forEach(s => {
        console.log(`  - ID: ${s._id}, Status: ${s.status}, Created: ${s.createdAt}, Responses: ${s.responses?.length || 0}`);
      });
    }
    
    // Get the most recent active session or the most recent one
    const session = sessions.find(s => s.status === 'active') || 
                   sessions.sort((a, b) => b.createdAt - a.createdAt)[0];
    
    if (!session) {
      return res.status(404).json({ 
        success: false, 
        error: 'Session not found' 
      });
    }
    
    // Debug logging for response tracking
    console.log('[Sessions] Getting session stats:', {
      sessionCode: session.sessionCode,
      responseArrayExists: !!session.responses,
      responseCount: session.responses ? session.responses.length : 0,
      participantCount: session.participants.length,
      responseSample: session.responses && session.responses.length > 0 ? 
        `First response: ${JSON.stringify(session.responses[0])}` : 'No responses'
    });
    
    // Ensure requireLogin is always included in response
    const requireLogin = session.requireLogin === true ? true : false;
    
    res.json({
      success: true,
      session: {
        id: session._id,
        sessionCode: session.sessionCode,
        title: session.title,
        status: session.status,
        currentQuestion: session.currentQuestion,
        participantCount: session.participants.length,
        responseCount: session.responses ? session.responses.length : 0,
        totalQuestions: session.totalQuestions || 0,
        questionCount: session.questionsSent ? session.questionsSent.length : 0,
        requireLogin: requireLogin,
        restrictToEnrolled: session.restrictToEnrolled,
        allowAnswerChange: session.allowAnswerChange,
        classId: session.classId
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
    const { sessionCode, name, userId, deviceId } = req.body;
    console.log('[Sessions] Join request:', { sessionCode, name, userId, deviceId });
    
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
    
    // Ensure requireLogin field exists (safeguard for existing sessions)
    if (session.requireLogin === undefined || session.requireLogin === null) {
      session.requireLogin = false;
      // Try to save the fix
      session.markModified('requireLogin');
      await session.save();
      console.log('[Sessions] Fixed missing requireLogin field for session:', session.sessionCode);
    }
    
    console.log('[Sessions] Session requireLogin:', session.requireLogin);
    console.log('[Sessions] Session requireLogin type:', typeof session.requireLogin);
    console.log('[Sessions] User ID provided:', userId);
    console.log('[Sessions] User ID type:', typeof userId);
    console.log('[Sessions] RequireLogin check result:', session.requireLogin && !userId);
    
    // Check if login is required for this session
    if (session.requireLogin === true && !userId) {
      console.log('[Sessions] Login required but no userId provided - rejecting join');
      return res.status(401).json({
        success: false,
        error: 'Login required',
        requireLogin: true,
        message: 'This session requires you to be logged in. Please log in to join.'
      });
    }
    
    console.log('[Sessions] Login check passed, checking enrollment...');
    
    // Check enrollment restriction
    const effectiveClassId = session.classId || session.rosterId;
    console.log('[Sessions] Enrollment check:', {
      restrictToEnrolled: session.restrictToEnrolled,
      effectiveClassId: effectiveClassId,
      userId: userId,
      willCheck: session.restrictToEnrolled && effectiveClassId && userId
    });
    
    if (session.restrictToEnrolled && userId) {
      // Import the enrollment model
      const ClassEnrollment = require('../models/ClassEnrollment');
      
      let enrollment;
      
      if (effectiveClassId) {
        // Check enrollment for specific class
        console.log('[Sessions] Checking enrollment for specific class:', effectiveClassId);
        
        enrollment = await ClassEnrollment.findOne({
          classId: effectiveClassId,
          studentId: userId,
          status: { $in: ['enrolled', 'pending'] }  // Allow both enrolled and pending students
        });
      } else {
        // Check if student is enrolled in ANY class taught by this instructor
        console.log('[Sessions] Checking enrollment in ANY class by instructor:', session.instructorId);
        
        // First get all classes by this instructor
        const Class = require('../models/Class');
        const instructorClasses = await Class.find({ instructorId: session.instructorId });
        const classIds = instructorClasses.map(c => c._id);
        
        console.log('[Sessions] Found instructor classes:', classIds.length);
        
        if (classIds.length > 0) {
          enrollment = await ClassEnrollment.findOne({
            classId: { $in: classIds },
            studentId: userId,
            status: { $in: ['enrolled', 'pending'] }
          });
        }
      }
      
      console.log('[Sessions] Enrollment search result:', enrollment ? 'Found' : 'Not found');
      
      if (!enrollment) {
        const message = effectiveClassId 
          ? 'You must be enrolled in this class to join the session.'
          : 'You must be enrolled in at least one of the instructor\'s classes to join this session.';
          
        console.log('[Sessions] Student not enrolled - rejecting join');
        return res.status(403).json({
          success: false,
          error: 'Not enrolled',
          message: message
        });
      }
      
      console.log('[Sessions] Student is enrolled, allowing join');
    } else if (session.restrictToEnrolled && !userId) {
      console.log('[Sessions] Session restricted but no userId - requiring login');
      return res.status(401).json({
        success: false,
        error: 'Login required',
        requireLogin: true,
        message: 'You must be logged in to join this restricted session.'
      });
    } else {
      console.log('[Sessions] Skipping enrollment check:', {
        restrictToEnrolled: session.restrictToEnrolled,
        hasUserId: !!userId
      });
    }
    
    // Initialize participants array if it doesn't exist
    if (!session.participants) {
      session.participants = [];
    }
    
    console.log('[Sessions] Current participants before checking:', session.participants.length);
    
    // Check if participant already exists by deviceId
    let existingParticipant = null;
    if (deviceId) {
      existingParticipant = session.participants.find(p => p.deviceId === deviceId);
    }
    
    if (existingParticipant) {
      console.log('[Sessions] Found existing participant with deviceId:', deviceId);
      // Update participant name and last join time
      existingParticipant.name = name || existingParticipant.name || 'Anonymous';
      existingParticipant.lastJoinedAt = new Date();
      
      console.log('[Sessions] Updating existing participant');
      await session.save();
      
      res.json({
        success: true,
        participantId: existingParticipant.participantId,
        session: {
          id: session._id,
          sessionCode: session.sessionCode,
          title: session.title,
          status: session.status,
          currentQuestion: session.currentQuestion
        }
      });
    } else {
      // Generate new participant ID
      const participantId = `P${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
      
      // Check if enrolled (for tracking purposes)
      let isEnrolled = false;
      if (userId) {
        const ClassEnrollment = require('../models/ClassEnrollment');
        
        if (effectiveClassId) {
          // Check enrollment in specific class
          const enrollment = await ClassEnrollment.findOne({
            classId: effectiveClassId,
            studentId: userId,
            status: { $in: ['enrolled', 'pending'] }
          });
          isEnrolled = !!enrollment;
        } else {
          // Check enrollment in any instructor's class
          const Class = require('../models/Class');
          const instructorClasses = await Class.find({ instructorId: session.instructorId });
          const classIds = instructorClasses.map(c => c._id);
          
          if (classIds.length > 0) {
            const enrollment = await ClassEnrollment.findOne({
              classId: { $in: classIds },
              studentId: userId,
              status: { $in: ['enrolled', 'pending'] }
            });
            isEnrolled = !!enrollment;
          }
        }
      }
      
      // Add new participant to session
      session.participants.push({
        userId: userId || null,
        participantId,
        deviceId: deviceId || null,
        name: name || 'Anonymous',
        joinedAt: new Date(),
        lastJoinedAt: new Date(),
        isEnrolled: isEnrolled
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
    }
    
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
  // Prevent caching of this endpoint
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  
  try {
    const sessionCode = req.params.sessionCode.toUpperCase();
    
    // Find ALL sessions with this code
    const sessions = await Session.find({ sessionCode });
    console.log(`[Sessions] Found ${sessions.length} sessions with code ${sessionCode}`);
    
    if (sessions.length > 1) {
      console.warn('[Sessions] DUPLICATE SESSIONS FOUND!');
      sessions.forEach(s => {
        console.log(`  - ID: ${s._id}, Status: ${s.status}, Created: ${s.createdAt}`);
      });
    }
    
    // Get the most recent active session or the most recent one
    const session = sessions.find(s => s.status === 'active') || 
                   sessions.sort((a, b) => b.createdAt - a.createdAt)[0];
    
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    // Debug logging
    console.log('[Sessions] Getting current question for session:', session.sessionCode);
    console.log('[Sessions] Current question in DB:', JSON.stringify(session.currentQuestion, null, 2));
    
    // Transform currentQuestion to match frontend expectations
    let question = null;
    if (session.currentQuestion && (session.currentQuestion.questionText || session.currentQuestion.text)) {
      try {
        question = {
          id: session.currentQuestion.questionId,
          sessionId: session._id,
          questionText: session.currentQuestion.questionText || session.currentQuestion.text,  // Support both fields
          type: session.currentQuestion.questionType || session.currentQuestion.type,
          options: session.currentQuestion.options && session.currentQuestion.options.length > 0 
            ? session.currentQuestion.options.map((opt, idx) => ({
                id: String.fromCharCode(65 + idx), // A, B, C, D
                text: opt
              }))
            : [],
          points: session.currentQuestion.points || 10,
          timeLimit: session.currentQuestion.timeLimit || 30,
          startedAt: session.currentQuestion.startedAt
        };
        console.log('[Sessions] Transformed question:', JSON.stringify(question, null, 2));
      } catch (transformError) {
        console.error('[Sessions] Error transforming question:', transformError);
        console.error('[Sessions] Question data:', session.currentQuestion);
      }
    } else {
      console.log('[Sessions] No question found or questionText missing');
      console.log('[Sessions] currentQuestion exists?', !!session.currentQuestion);
      if (session.currentQuestion) {
        console.log('[Sessions] questionText exists?', !!session.currentQuestion.questionText);
      }
    }
    
    console.log('[Sessions] Returning question response:', {
      success: true,
      question: question,
      sessionStatus: session.status
    });
    
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
    
    const { questionId, questionText, questionType, options, correctAnswer, points, timeLimit, text, type } = req.body;
    
    // Create question object with field normalization
    const question = {
      questionId: questionId || `Q${Date.now()}`,
      questionText: questionText || text,  // Support both field names
      questionType: questionType || type || 'multiple_choice',  // Support both field names
      options,
      correctAnswer,
      points: points || 10,
      timeLimit: timeLimit || 30,
      startedAt: new Date()
    };
    
    // Ensure questionText is set
    if (!question.questionText) {
      console.error('[Sessions] Missing question text!', req.body);
      return res.status(400).json({ success: false, error: 'Question text is required' });
    }
    
    console.log('[Sessions] Normalized question:', {
      hasQuestionText: !!question.questionText,
      questionText: question.questionText.substring(0, 50) + '...'
    });
    
    // Set as current question
    session.currentQuestion = question;
    session.currentQuestionIndex = (session.currentQuestionIndex || 0) + 1;
    
    // Track question in questionsSent array
    session.questionsSent.push({
      questionId: question.questionId,
      questionText: question.questionText,
      sentAt: new Date()
    });
    
    // Update total questions count
    session.totalQuestions = session.questionsSent.length;
    
    // CRITICAL: Mark currentQuestion as modified for Mongoose
    session.markModified('currentQuestion');
    
    // Update session status if needed
    if (session.status === 'waiting') {
      console.log('[Sessions] Updating session status from waiting to active');
      session.status = 'active';
      session.startedAt = new Date();
    }
    
    console.log('[Sessions] Saving session with question:', {
      questionId: question.questionId,
      sessionStatus: session.status,
      questionText: question.questionText
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

// Update question timer
router.post('/:id/questions/:questionId/timer', auth, async (req, res) => {
  try {
    const { addSeconds } = req.body;
    const session = await Session.findById(req.params.id);
    
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    // Verify the instructor owns this session
    if (session.instructorId.toString() !== (req.user.userId || req.user.id)) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    
    // Update current question time limit if it exists
    if (session.currentQuestion && session.currentQuestion.timeLimit) {
      console.log('[Sessions] Adding time to question:', {
        currentTimeLimit: session.currentQuestion.timeLimit,
        addSeconds: addSeconds,
        newTimeLimit: session.currentQuestion.timeLimit + addSeconds
      });
      
      session.currentQuestion.timeLimit += addSeconds;
      session.markModified('currentQuestion');
      await session.save();
      
      res.json({
        success: true,
        message: 'Timer updated',
        newTimeLimit: session.currentQuestion.timeLimit
      });
    } else {
      res.status(400).json({ 
        success: false, 
        error: 'No active question to update' 
      });
    }
    
  } catch (error) {
    console.error('Error updating timer:', error);
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

// Update session (including ending it)
router.put('/:id', auth, async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    // Verify the instructor owns this session
    if (session.instructorId.toString() !== (req.user.userId || req.user.id)) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    
    // Update allowed fields
    const allowedUpdates = ['status', 'title', 'description'];
    const updates = {};
    
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });
    
    // If ending the session, clear current question
    if (updates.status === 'ended') {
      updates.currentQuestion = null;
      console.log('[Sessions] Ending session:', session.sessionCode);
    }
    
    // Apply updates
    Object.assign(session, updates);
    await session.save();
    
    res.json({
      success: true,
      message: 'Session updated successfully',
      session: {
        id: session._id,
        sessionCode: session.sessionCode,
        status: session.status
      }
    });
    
  } catch (error) {
    console.error('Error updating session:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update session status (PATCH endpoint for frontend compatibility)
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    // Verify the instructor owns this session
    if (session.instructorId.toString() !== (req.user.userId || req.user.id)) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ success: false, error: 'Status is required' });
    }
    
    // Update status
    session.status = status;
    
    // If ending the session, clear current question
    if (status === 'ended') {
      session.currentQuestion = null;
      console.log('[Sessions] Ending session:', session.sessionCode);
    }
    
    await session.save();
    
    res.json({
      success: true,
      message: 'Session status updated successfully',
      session: {
        id: session._id,
        sessionCode: session.sessionCode,
        status: session.status
      }
    });
    
  } catch (error) {
    console.error('Error updating session status:', error);
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
  // Prevent caching
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  
  try {
    const sessionCode = req.params.sessionCode.toUpperCase();
    
    // Find ALL sessions with this code
    const sessions = await Session.find({ sessionCode });
    console.log(`[Sessions] Found ${sessions.length} sessions with code ${sessionCode}`);
    
    if (sessions.length > 1) {
      console.warn('[Sessions] DUPLICATE SESSIONS FOUND!');
      sessions.forEach(s => {
        console.log(`  - ID: ${s._id}, Status: ${s.status}, Created: ${s.createdAt}`);
      });
    }
    
    // Get the most recent active session or the most recent one
    const session = sessions.find(s => s.status === 'active') || 
                   sessions.sort((a, b) => b.createdAt - a.createdAt)[0];
    
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    console.log(`[Sessions] Using session ${session._id} for responses`);
    console.log(`[Sessions] Session has ${session.responses?.length || 0} responses`);
    
    // Group responses by question and include participant names
    const responsesByQuestion = {};
    const responsesWithNames = [];
    
    if (session.responses && session.responses.length > 0) {
      // Create a map of participant IDs to names for quick lookup
      const participantMap = {};
      session.participants.forEach(p => {
        participantMap[p.participantId] = p.name || 'Anonymous';
      });
      
      session.responses.forEach(response => {
        const questionId = response.questionId;
        const participantName = participantMap[response.participantId] || response.participantId;
        
        // Add to responses with names
        responsesWithNames.push({
          ...response.toObject ? response.toObject() : response,
          participantName: participantName,
          name: participantName // Add both fields for compatibility
        });
        
        if (!responsesByQuestion[questionId]) {
          responsesByQuestion[questionId] = [];
        }
        responsesByQuestion[questionId].push({
          participantId: response.participantId,
          participantName: participantName,
          answer: response.answer,
          submittedAt: response.submittedAt
        });
      });
    }
    
    res.json({
      success: true,
      responses: responsesWithNames,
      responsesByQuestion,
      totalResponses: session.responses?.length || 0,
      sessionId: session._id,
      sessionStatus: session.status
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
    const sessionCode = req.params.sessionCode.toUpperCase();
    
    console.log('[Sessions] Response submission:', {
      sessionCode,
      questionId,
      answer,
      participantId
    });
    
    // Find ALL sessions with this code
    const sessions = await Session.find({ sessionCode });
    console.log(`[Sessions] Found ${sessions.length} sessions with code ${sessionCode}`);
    
    if (sessions.length > 1) {
      console.warn('[Sessions] DUPLICATE SESSIONS FOUND!');
      sessions.forEach(s => {
        console.log(`  - ID: ${s._id}, Status: ${s.status}, Created: ${s.createdAt}`);
      });
    }
    
    // Get the most recent active session or the most recent one
    const session = sessions.find(s => s.status === 'active') || 
                   sessions.sort((a, b) => b.createdAt - a.createdAt)[0];
    
    if (!session) {
      console.error('[Sessions] Session not found for response:', sessionCode);
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    console.log('[Sessions] Found session for response:', {
      id: session._id,
      code: session.sessionCode,
      responseCount: session.responses?.length || 0
    });
    
    // Check for duplicate submission
    const effectiveParticipantId = participantId || req.user?.userId || `anon_${Date.now()}`;
    
    // Initialize responses array if it doesn't exist
    if (!session.responses) {
      session.responses = [];
    }
    
    // Check if this participant already answered this question
    const existingResponseIndex = session.responses.findIndex(r => 
      r.participantId === effectiveParticipantId && 
      r.questionId === questionId
    );
    
    if (existingResponseIndex !== -1) {
      if (session.allowAnswerChange) {
        // Allow answer change - update the existing response
        console.log('[Sessions] Answer change allowed, updating existing response');
        session.responses[existingResponseIndex].answer = answer;
        session.responses[existingResponseIndex].submittedAt = new Date();
        
        await session.save();
        
        return res.json({ 
          success: true, 
          message: 'Answer updated successfully',
          responseId: session.responses[existingResponseIndex]._id,
          isUpdate: true
        });
      } else {
        // Answer change not allowed
        console.log('[Sessions] Duplicate response detected, answer change not allowed');
        return res.json({ 
          success: true, 
          message: 'Response already recorded',
          responseId: session.responses[existingResponseIndex]._id,
          isDuplicate: true
        });
      }
    }
    
    // Store response
    const response = {
      userId: req.user?.userId || null,  // Handle unauthenticated users
      participantId: effectiveParticipantId,
      questionId,
      answer,
      submittedAt: new Date()
    };
    
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

// Cleanup duplicate sessions (admin endpoint)
router.post('/cleanup-duplicates', async (req, res) => {
  try {
    const { adminKey } = req.body;
    
    // Simple security check
    if (adminKey !== 'cleanup-2024') {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    
    // Find all sessions grouped by code
    const sessions = await Session.find({}).sort({ sessionCode: 1, createdAt: -1 });
    
    const sessionsByCode = {};
    sessions.forEach(session => {
      if (!sessionsByCode[session.sessionCode]) {
        sessionsByCode[session.sessionCode] = [];
      }
      sessionsByCode[session.sessionCode].push(session);
    });
    
    let cleanedCount = 0;
    const cleanupReport = [];
    
    // For each session code with duplicates
    for (const [code, duplicateSessions] of Object.entries(sessionsByCode)) {
      if (duplicateSessions.length > 1) {
        // Sort by creation date, newest first
        duplicateSessions.sort((a, b) => b.createdAt - a.createdAt);
        
        // Keep the newest active session, or just the newest if none are active
        const activeSession = duplicateSessions.find(s => s.status === 'active');
        const sessionToKeep = activeSession || duplicateSessions[0];
        
        // Delete the others
        for (const session of duplicateSessions) {
          if (session._id.toString() !== sessionToKeep._id.toString()) {
            await Session.deleteOne({ _id: session._id });
            cleanedCount++;
            cleanupReport.push({
              code,
              deletedId: session._id,
              status: session.status,
              created: session.createdAt,
              responses: session.responses?.length || 0
            });
          }
        }
      }
    }
    
    res.json({
      success: true,
      message: `Cleaned up ${cleanedCount} duplicate sessions`,
      report: cleanupReport
    });
    
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
const express = require('express');
const router = express.Router();
const Session = require('../models/Session');
const ClassEnrollment = require('../models/ClassEnrollment');
const Class = require('../models/Class');
const auth = require('../middleware/auth');

// Create a new session linked to a class
router.post('/create-for-class', auth, async (req, res) => {
  try {
    const { title, description, classId, requireLogin = true, platform = 'powerpoint' } = req.body;
    
    // Class access already verified by middleware
    const classDoc = req.class;
    
    if (!classDoc) {
      return res.status(404).json({ 
        success: false, 
        error: 'Class not found' 
      });
    }
    
    // Log who created the session
    const creatorRole = req.userRole; // 'instructor' or 'teaching_assistant'
    
    // Generate unique session code
    const sessionCode = generateSessionCode();
    
    // Create session with class association
    const session = new Session({
      sessionCode,
      title: title || `${classDoc.name} - Live Session`,
      description: description || `Live session for ${classDoc.name}`,
      instructorId: req.user._id,
      classId: classId,
      requireLogin: requireLogin,
      metadata: {
        platform: platform,
        className: classDoc.name,
        classCode: classDoc.code
      }
    });
    
    await session.save();
    
    res.json({
      success: true,
      session: {
        id: session._id,
        sessionCode: session.sessionCode,
        title: session.title,
        classId: session.classId,
        joinUrl: `https://join.intellaclick.com/session/${session.sessionCode}`
      }
    });
  } catch (error) {
    console.error('Error creating class session:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create session' 
    });
  }
});

// Enhanced join endpoint that checks class enrollment
router.post('/join-class-session', async (req, res) => {
  try {
    const { sessionCode, name, userId, deviceId } = req.body;
    
    const session = await Session.findOne({ 
      sessionCode: sessionCode.toUpperCase() 
    }).populate('classId');
    
    if (!session) {
      return res.status(404).json({ 
        success: false, 
        error: 'Session not found' 
      });
    }
    
    // If session is linked to a class, check enrollment
    if (session.classId && session.requireLogin) {
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Login required',
          requireLogin: true,
          message: 'This class session requires you to be logged in with your student account.'
        });
      }
      
      // Check if student is enrolled in the class
      const enrollment = await ClassEnrollment.findOne({
        classId: session.classId,
        studentId: userId,
        status: 'enrolled'
      });
      
      if (!enrollment) {
        return res.status(403).json({
          success: false,
          error: 'Not enrolled',
          message: `You must be enrolled in ${session.classId.name} to join this session.`,
          enrollmentRequired: true,
          classInfo: {
            name: session.classId.name,
            code: session.classId.code,
            joinCode: session.classId.joinCode
          }
        });
      }
    }
    
    // Check if participant already exists
    let existingParticipant = session.participants.find(p => 
      (userId && p.userId && p.userId.toString() === userId) || 
      (deviceId && p.deviceId === deviceId)
    );
    
    if (existingParticipant) {
      // Update last join time
      existingParticipant.lastJoinedAt = new Date();
      await session.save();
      
      return res.json({
        success: true,
        participantId: existingParticipant.participantId,
        session: {
          id: session._id,
          sessionCode: session.sessionCode,
          title: session.title,
          status: session.status,
          currentQuestion: session.currentQuestion,
          isClassSession: !!session.classId,
          className: session.classId?.name
        }
      });
    }
    
    // Add new participant
    const participantId = `P${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
    
    session.participants.push({
      userId: userId || null,
      participantId,
      deviceId: deviceId || null,
      name: name || 'Anonymous',
      joinedAt: new Date(),
      lastJoinedAt: new Date(),
      isEnrolled: !!session.classId // Track if they're enrolled students
    });
    
    await session.save();
    
    // If this is a class session, update attendance
    if (session.classId && userId) {
      // Update enrollment attendance stats
      await ClassEnrollment.findOneAndUpdate(
        { classId: session.classId, studentId: userId },
        { 
          $inc: { 'attendanceStats.sessionsAttended': 1 },
          $set: { 'attendanceStats.lastAttendance': new Date() }
        }
      );
    }
    
    res.json({
      success: true,
      participantId,
      session: {
        id: session._id,
        sessionCode: session.sessionCode,
        title: session.title,
        status: session.status,
        currentQuestion: session.currentQuestion,
        isClassSession: !!session.classId,
        className: session.classId?.name
      }
    });
  } catch (error) {
    console.error('Error joining class session:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to join session' 
    });
  }
});

// Create a regular (non-PowerPoint) session linked to a class
router.post('/create-quiz-session', auth, async (req, res) => {
  try {
    const { title, description, classId, requireLogin = true, questionIds = [] } = req.body;
    
    // Class access already verified by middleware
    const classDoc = req.class;
    
    if (!classDoc) {
      return res.status(404).json({ 
        success: false, 
        error: 'Class not found' 
      });
    }
    
    // Log who created the session
    const creatorRole = req.userRole; // 'instructor' or 'teaching_assistant'
    
    // Generate unique session code
    const sessionCode = generateSessionCode();
    
    // Create session with class association
    const session = new Session({
      sessionCode,
      title: title || `${classDoc.name} - Quiz Session`,
      description: description || `Live quiz session for ${classDoc.name}`,
      instructorId: req.user._id,
      classId: classId,
      requireLogin: requireLogin,
      metadata: {
        platform: 'standalone',
        className: classDoc.name,
        classCode: classDoc.code
      },
      // Pre-load questions if provided
      questionsSent: questionIds.map((qId, index) => ({
        questionId: qId,
        questionIndex: index,
        sentAt: null // Will be set when question is activated
      }))
    });
    
    await session.save();
    
    res.json({
      success: true,
      session: {
        id: session._id,
        sessionCode: session.sessionCode,
        title: session.title,
        classId: session.classId,
        className: classDoc.name,
        joinUrl: `https://join.intellaclick.com/session/${session.sessionCode}`,
        totalQuestions: questionIds.length
      }
    });
  } catch (error) {
    console.error('Error creating quiz session:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create session' 
    });
  }
});

// Get sessions for a specific class
router.get('/class/:classId', auth, async (req, res) => {
  try {
    const { classId } = req.params;
    
    // Verify instructor has access to this class
    const classDoc = await Class.findOne({ 
      _id: classId,
      $or: [
        { instructorId: req.user._id },
        { coInstructors: req.user._id },
        { teachingAssistants: req.user._id }
      ]
    });
    
    if (!classDoc) {
      return res.status(404).json({ 
        success: false, 
        error: 'Class not found or you do not have permission' 
      });
    }
    
    const sessions = await Session.find({ classId })
      .select('sessionCode title status createdAt participants')
      .sort('-createdAt');
    
    res.json({
      success: true,
      sessions: sessions.map(s => ({
        id: s._id,
        sessionCode: s.sessionCode,
        title: s.title,
        status: s.status,
        createdAt: s.createdAt,
        participantCount: s.participants.length
      }))
    });
  } catch (error) {
    console.error('Error fetching class sessions:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch sessions' 
    });
  }
});

// Helper function to generate unique session codes
function generateSessionCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

module.exports = router;
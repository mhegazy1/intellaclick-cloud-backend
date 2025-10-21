const express = require('express');
const router = express.Router();
const Session = require('../models/Session');
const GamificationService = require('../services/gamificationService');
const auth = require('../middleware/auth');
const { compareAnswers } = require('../utils/answerComparison');

/**
 * Enhanced session end endpoint that processes gamification
 */
router.post('/:sessionId/end-with-gamification', auth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const instructorId = req.user._id || req.user.userId;
    
    // Find and verify session
    const session = await Session.findById(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    
    if (session.instructorId.toString() !== instructorId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to end this session'
      });
    }
    
    if (session.status === 'ended') {
      return res.status(400).json({
        success: false,
        error: 'Session already ended'
      });
    }
    
    // Mark session as ended
    session.status = 'ended';
    session.endedAt = new Date();
    await session.save();
    
    // Process gamification only if session is linked to a class
    if (!session.classId) {
      return res.json({
        success: true,
        message: 'Session ended (no gamification - not linked to a class)'
      });
    }
    
    // Get all participants who submitted responses
    const participantResults = new Map();
    
    // Group responses by participant
    session.responses.forEach(response => {
      const key = response.userId || response.participantId;
      if (!participantResults.has(key)) {
        participantResults.set(key, {
          userId: response.userId,
          participantId: response.participantId,
          responses: [],
          correctAnswers: 0,
          totalQuestions: 0
        });
      }
      participantResults.get(key).responses.push(response);
    });
    
    // Process each participant's results
    const gamificationResults = [];
    
    for (const [key, participantData] of participantResults) {
      // Skip if no userId (anonymous participants)
      if (!participantData.userId) {
        continue;
      }
      
      // Count correct answers
      let correctAnswers = 0;
      let totalResponseTime = 0;
      const processedResponses = [];
      
      // Find questions and check answers
      for (const response of participantData.responses) {
        const question = session.questionsSent.find(q => q.questionId === response.questionId);
        if (question) {
          const isCorrect = compareAnswers(response.answer, question.correctAnswer, question.questionType);
          if (isCorrect) correctAnswers++;
          
          const responseTime = response.submittedAt - question.sentAt;
          totalResponseTime += responseTime;
          
          processedResponses.push({
            questionId: response.questionId,
            answer: response.answer,
            isCorrect,
            responseTime,
            submittedAt: response.submittedAt
          });
        }
      }
      
      // Prepare session results for gamification
      const sessionResults = {
        sessionId: session._id,
        totalQuestions: session.questionsSent.length,
        correctAnswers,
        totalTime: totalResponseTime,
        responses: processedResponses
      };
      
      // Process through gamification service
      const result = await GamificationService.processSessionResults(
        participantData.userId,
        session.classId,
        sessionResults
      );
      
      gamificationResults.push({
        userId: participantData.userId,
        participantId: participantData.participantId,
        ...result
      });
    }
    
    res.json({
      success: true,
      message: 'Session ended and gamification processed',
      sessionStats: {
        totalParticipants: session.participants.length,
        totalResponses: session.responses.length,
        gamificationProcessed: gamificationResults.length
      },
      gamificationResults
    });
    
  } catch (error) {
    console.error('Error ending session with gamification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to end session'
    });
  }
});

/**
 * Get real-time session results with gamification preview
 */
router.get('/:sessionId/results-preview', auth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = await Session.findById(sessionId)
      .populate('classId', 'name code');
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    
    // Aggregate results by participant
    const results = new Map();
    
    session.responses.forEach(response => {
      const key = response.userId || response.participantId;
      if (!results.has(key)) {
        const participant = session.participants.find(p => 
          p.userId?.toString() === response.userId?.toString() || 
          p.participantId === response.participantId
        );
        
        results.set(key, {
          userId: response.userId,
          participantId: response.participantId,
          name: participant?.name || 'Anonymous',
          responses: [],
          correctAnswers: 0,
          score: 0,
          potentialPoints: 0
        });
      }
      
      const participantResult = results.get(key);
      const question = session.questionsSent.find(q => q.questionId === response.questionId);

      if (question) {
        const isCorrect = compareAnswers(response.answer, question.correctAnswer, question.questionType);
        if (isCorrect) {
          participantResult.correctAnswers++;
          participantResult.potentialPoints += 5; // 5 points per correct answer
        }
        
        const responseTime = response.submittedAt - question.sentAt;
        if (responseTime < 5000 && isCorrect) {
          participantResult.potentialPoints += 1; // Speed bonus
        }
        
        participantResult.responses.push({
          questionId: response.questionId,
          answer: response.answer,
          isCorrect,
          responseTime
        });
      }
    });
    
    // Calculate scores
    results.forEach(result => {
      if (session.questionsSent.length > 0) {
        result.score = (result.correctAnswers / session.questionsSent.length) * 100;
        
        // Add participation points
        result.potentialPoints += 10;
        
        // Perfect score bonus
        if (result.score === 100 && session.questionsSent.length >= 5) {
          result.potentialPoints += 50;
        }
      }
    });
    
    // Convert to array and sort by score
    const leaderboard = Array.from(results.values())
      .sort((a, b) => b.score - a.score);
    
    res.json({
      success: true,
      session: {
        id: session._id,
        title: session.title,
        status: session.status,
        isClassSession: !!session.classId,
        className: session.classId?.name,
        totalQuestions: session.questionsSent.length,
        totalParticipants: session.participants.length,
        totalResponses: session.responses.length
      },
      leaderboard: leaderboard.map((participant, index) => ({
        rank: index + 1,
        ...participant
      })),
      gamificationEnabled: !!session.classId
    });
    
  } catch (error) {
    console.error('Error getting session results:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get results'
    });
  }
});

/**
 * Submit response with immediate feedback and points preview
 */
router.post('/code/:sessionCode/respond-enhanced', async (req, res) => {
  try {
    const { questionId, answer, timeSpent, participantId, userId } = req.body;
    const sessionCode = req.params.sessionCode.toUpperCase();
    
    // Find the session
    const session = await Session.findOne({ 
      sessionCode, 
      status: { $in: ['waiting', 'active'] } 
    });
    
    if (!session) {
      return res.status(404).json({ 
        success: false, 
        error: 'Session not found' 
      });
    }
    
    // Find the current question
    const currentQuestion = session.questionsSent.find(q => q.questionId === questionId);
    if (!currentQuestion) {
      return res.status(400).json({
        success: false,
        error: 'Question not found in session'
      });
    }
    
    // Store response
    const response = {
      userId: userId || null,
      participantId: participantId || `anon_${Date.now()}`,
      questionId,
      answer,
      submittedAt: new Date()
    };
    
    // Check if correct
    const isCorrect = compareAnswers(answer, currentQuestion.correctAnswer, currentQuestion.questionType);

    // Calculate potential points
    let points = 0;
    if (session.classId && userId) {
      if (isCorrect) {
        points += 5; // Base points for correct answer
        
        // Speed bonus
        const responseTime = new Date() - currentQuestion.sentAt;
        if (responseTime < 5000) {
          points += 1;
        }
      }
    }
    
    // Save response
    if (!session.responses) {
      session.responses = [];
    }
    session.responses.push(response);
    await session.save();
    
    res.json({
      success: true,
      message: 'Response recorded',
      feedback: {
        isCorrect,
        correctAnswer: isCorrect ? null : currentQuestion.correctAnswer,
        potentialPoints: points,
        explanation: currentQuestion.explanation
      },
      gamificationEnabled: !!session.classId
    });
    
  } catch (error) {
    console.error('Error submitting response:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;
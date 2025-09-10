const Session = require('../models/Session');
const StudentProgress = require('../models/StudentProgress');
const GamificationService = require('./gamificationService');
const Class = require('../models/Class');

class ClickerResultsService {
  /**
   * Process and store clicker session results from desktop app
   * This is called when a clicker session ends (PowerPoint or regular)
   * 
   * @param {Object} sessionData - Complete session data from desktop app
   * @returns {Object} Processing results including gamification
   */
  static async processClickerResults(sessionData) {
    try {
      const {
        sessionId,
        sessionCode,
        platform,         // 'powerpoint', 'standalone', 'web'
        classId,
        instructorId,
        startTime,
        endTime,
        questions,        // Array of questions asked
        participants,     // Array of participants
        responses,        // All responses from the session
        metadata = {}
      } = sessionData;
      
      // Find or create the session record
      let session = await Session.findById(sessionId);
      
      if (!session && sessionCode) {
        session = await Session.findOne({ sessionCode });
      }
      
      if (!session) {
        // Create new session record if it doesn't exist
        session = new Session({
          sessionCode,
          title: metadata.title || 'Clicker Session',
          instructorId,
          classId,
          status: 'ended',
          startedAt: startTime,
          endedAt: endTime,
          metadata: {
            platform: platform || 'desktop',
            ...metadata
          }
        });
      }
      
      // Update session with complete data
      session.status = 'ended';
      session.endedAt = endTime || new Date();
      session.totalQuestions = questions.length;
      
      // Store all questions
      session.questionsSent = questions.map(q => ({
        questionId: q.id,
        questionText: q.text,
        questionType: q.type,
        options: q.options,
        correctAnswer: q.correctAnswer,
        points: q.points || 10,
        timeLimit: q.timeLimit || 30,
        sentAt: q.sentAt
      }));
      
      // Store all participants
      session.participants = participants.map(p => ({
        userId: p.userId,
        participantId: p.participantId || p.deviceId,
        name: p.name,
        deviceId: p.deviceId,
        joinedAt: p.joinedAt,
        isEnrolled: p.isEnrolled !== false // Default true for backward compatibility
      }));
      
      // Store all responses
      session.responses = responses;
      
      await session.save();
      
      // Process gamification if linked to a class
      let gamificationResults = [];
      if (classId) {
        gamificationResults = await this.processGamificationForSession(session);
      }
      
      // Generate analytics
      const analytics = await this.generateSessionAnalytics(session);
      
      // Store session reference in class for easy access
      if (classId) {
        await Class.findByIdAndUpdate(classId, {
          $push: { 
            recentSessions: {
              sessionId: session._id,
              date: session.endedAt,
              platform: session.metadata.platform
            }
          }
        });
      }
      
      return {
        success: true,
        sessionId: session._id,
        sessionCode: session.sessionCode,
        analytics,
        gamificationResults,
        message: 'Clicker session results processed successfully'
      };
      
    } catch (error) {
      console.error('Error processing clicker results:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Process gamification for all enrolled participants
   */
  static async processGamificationForSession(session) {
    const results = [];
    
    // Group responses by participant
    const participantResponses = new Map();
    
    session.responses.forEach(response => {
      const key = response.userId || response.participantId;
      if (!participantResponses.has(key)) {
        participantResponses.set(key, []);
      }
      participantResponses.get(key).push(response);
    });
    
    // Process each participant
    for (const [participantKey, responses] of participantResponses) {
      // Skip if no userId (anonymous)
      const participant = session.participants.find(p => 
        (p.userId && p.userId.toString() === participantKey) || 
        p.participantId === participantKey
      );
      
      if (!participant || !participant.userId) {
        continue;
      }
      
      // Calculate results
      let correctAnswers = 0;
      let totalResponseTime = 0;
      const processedResponses = [];
      
      responses.forEach(response => {
        const question = session.questionsSent.find(q => 
          q.questionId === response.questionId
        );
        
        if (question) {
          const isCorrect = response.answer === question.correctAnswer;
          if (isCorrect) correctAnswers++;
          
          const responseTime = new Date(response.submittedAt) - new Date(question.sentAt);
          totalResponseTime += responseTime;
          
          processedResponses.push({
            questionId: response.questionId,
            answer: response.answer,
            isCorrect,
            responseTime,
            submittedAt: response.submittedAt
          });
        }
      });
      
      // Process through gamification service
      const sessionResults = {
        sessionId: session._id,
        totalQuestions: session.questionsSent.length,
        correctAnswers,
        totalTime: totalResponseTime,
        responses: processedResponses
      };
      
      const gamificationResult = await GamificationService.processSessionResults(
        participant.userId,
        session.classId,
        sessionResults
      );
      
      results.push({
        userId: participant.userId,
        name: participant.name,
        ...gamificationResult
      });
    }
    
    return results;
  }
  
  /**
   * Generate detailed analytics for a session
   */
  static async generateSessionAnalytics(session) {
    const analytics = {
      totalParticipants: session.participants.length,
      enrolledParticipants: session.participants.filter(p => p.isEnrolled).length,
      totalResponses: session.responses.length,
      questionsAsked: session.questionsSent.length,
      platform: session.metadata?.platform || 'unknown',
      duration: session.endedAt - session.startedAt,
      questionAnalytics: [],
      participantPerformance: []
    };
    
    // Analyze each question
    session.questionsSent.forEach(question => {
      const questionResponses = session.responses.filter(r => 
        r.questionId === question.questionId
      );
      
      const correctResponses = questionResponses.filter(r => 
        r.answer === question.correctAnswer
      );
      
      // Calculate response distribution
      const answerDistribution = {};
      questionResponses.forEach(r => {
        answerDistribution[r.answer] = (answerDistribution[r.answer] || 0) + 1;
      });
      
      analytics.questionAnalytics.push({
        questionId: question.questionId,
        questionText: question.questionText,
        totalResponses: questionResponses.length,
        correctResponses: correctResponses.length,
        accuracy: questionResponses.length > 0 
          ? (correctResponses.length / questionResponses.length * 100).toFixed(2)
          : 0,
        answerDistribution,
        averageResponseTime: this.calculateAverageResponseTime(question, questionResponses)
      });
    });
    
    // Analyze participant performance
    const participantMap = new Map();
    
    session.responses.forEach(response => {
      const key = response.userId || response.participantId;
      if (!participantMap.has(key)) {
        const participant = session.participants.find(p => 
          (p.userId && p.userId.toString() === response.userId?.toString()) ||
          p.participantId === response.participantId
        );
        
        participantMap.set(key, {
          userId: response.userId,
          participantId: response.participantId,
          name: participant?.name || 'Anonymous',
          isEnrolled: participant?.isEnrolled || false,
          responses: 0,
          correct: 0,
          totalResponseTime: 0
        });
      }
      
      const stats = participantMap.get(key);
      stats.responses++;
      
      const question = session.questionsSent.find(q => q.questionId === response.questionId);
      if (question) {
        if (response.answer === question.correctAnswer) {
          stats.correct++;
        }
        const responseTime = new Date(response.submittedAt) - new Date(question.sentAt);
        stats.totalResponseTime += responseTime;
      }
    });
    
    // Convert to array and calculate scores
    analytics.participantPerformance = Array.from(participantMap.values())
      .map(stats => ({
        ...stats,
        score: session.questionsSent.length > 0 
          ? (stats.correct / session.questionsSent.length * 100).toFixed(2)
          : 0,
        averageResponseTime: stats.responses > 0 
          ? Math.round(stats.totalResponseTime / stats.responses / 1000) 
          : 0
      }))
      .sort((a, b) => parseFloat(b.score) - parseFloat(a.score));
    
    // Summary stats
    analytics.summary = {
      averageScore: this.calculateAverage(analytics.participantPerformance.map(p => parseFloat(p.score))),
      participationRate: session.questionsSent.length > 0
        ? (analytics.totalResponses / (session.participants.length * session.questionsSent.length) * 100).toFixed(2)
        : 0,
      enrolledParticipationRate: analytics.enrolledParticipants > 0
        ? (analytics.participantPerformance.filter(p => p.isEnrolled).length / analytics.enrolledParticipants * 100).toFixed(2)
        : 0
    };
    
    return analytics;
  }
  
  /**
   * Helper to calculate average response time
   */
  static calculateAverageResponseTime(question, responses) {
    if (responses.length === 0) return 0;
    
    const times = responses.map(r => {
      const responseTime = new Date(r.submittedAt) - new Date(question.sentAt);
      return responseTime;
    });
    
    const average = times.reduce((sum, time) => sum + time, 0) / times.length;
    return Math.round(average / 1000); // Convert to seconds
  }
  
  /**
   * Helper to calculate average
   */
  static calculateAverage(numbers) {
    if (numbers.length === 0) return 0;
    const sum = numbers.reduce((acc, num) => acc + num, 0);
    return (sum / numbers.length).toFixed(2);
  }
  
  /**
   * Get session results for instructor portal display
   */
  static async getSessionResultsForInstructor(sessionId, instructorId) {
    try {
      const session = await Session.findById(sessionId)
        .populate('classId', 'name code')
        .populate('participants.userId', 'firstName lastName email');
      
      if (!session) {
        throw new Error('Session not found');
      }
      
      // Verify instructor owns this session
      const isOwner = session.instructorId.toString() === instructorId.toString();
      
      // Or check if instructor owns the class
      let hasClassAccess = false;
      if (session.classId) {
        const classDoc = await Class.findById(session.classId);
        hasClassAccess = classDoc && (
          classDoc.instructorId.toString() === instructorId.toString() ||
          classDoc.coInstructors?.includes(instructorId)
        );
      }
      
      if (!isOwner && !hasClassAccess) {
        throw new Error('Access denied');
      }
      
      // Generate comprehensive analytics
      const analytics = await this.generateSessionAnalytics(session);
      
      // Get gamification data if available
      let gamificationData = null;
      if (session.classId) {
        const progressRecords = await StudentProgress.find({
          classId: session.classId,
          'milestones.lastSessionId': session._id
        }).populate('studentId', 'firstName lastName');
        
        gamificationData = {
          pointsAwarded: progressRecords.reduce((sum, p) => sum + (p.lastSessionPoints || 0), 0),
          achievementsUnlocked: progressRecords.reduce((sum, p) => sum + (p.lastSessionAchievements || 0), 0),
          participantsLeveledUp: progressRecords.filter(p => p.lastSessionLevelUp).length
        };
      }
      
      return {
        session: {
          id: session._id,
          code: session.sessionCode,
          title: session.title,
          platform: session.metadata?.platform || 'unknown',
          startTime: session.startedAt,
          endTime: session.endedAt,
          status: session.status,
          className: session.classId?.name,
          classCode: session.classId?.code
        },
        analytics,
        gamificationData,
        rawData: {
          questions: session.questionsSent,
          participants: session.participants,
          responses: session.responses
        }
      };
      
    } catch (error) {
      console.error('Error fetching session results:', error);
      throw error;
    }
  }
}

module.exports = ClickerResultsService;
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// Middleware to verify JWT token
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// In-memory storage (replace with MongoDB in production)
const syncData = {
  questions: new Map(),
  categories: new Map(),
  quizzes: new Map()
};

// POST /api/sync/push/v2 - Push changes from client
router.post('/push/v2', authMiddleware, async (req, res) => {
  try {
    console.log('Sync push received:', {
      questions: req.body.questions?.length || 0,
      categories: req.body.categories?.length || 0,
      quizzes: req.body.quizzes?.length || 0
    });

    const { questions = [], categories = [], quizzes = [] } = req.body;
    const results = {
      questions: { created: 0, updated: 0, failed: 0 },
      categories: { created: 0, updated: 0, failed: 0 },
      quizzes: { created: 0, updated: 0, failed: 0 }
    };

    // Process categories
    for (const category of categories) {
      try {
        if (category.deleted) {
          syncData.categories.delete(category.id);
        } else {
          syncData.categories.set(category.id, {
            ...category,
            syncId: category.id,
            syncVersion: (category.syncVersion || 0) + 1,
            lastSyncedAt: new Date().toISOString()
          });
          results.categories[category.syncId ? 'updated' : 'created']++;
        }
      } catch (error) {
        results.categories.failed++;
      }
    }

    // Process questions
    for (const question of questions) {
      try {
        if (question.deleted) {
          syncData.questions.delete(question.id);
        } else {
          syncData.questions.set(question.id, {
            ...question,
            syncId: question.id,
            syncVersion: (question.syncVersion || 0) + 1,
            lastSyncedAt: new Date().toISOString()
          });
          results.questions[question.syncId ? 'updated' : 'created']++;
        }
      } catch (error) {
        results.questions.failed++;
      }
    }

    // Process quizzes
    for (const quiz of quizzes) {
      try {
        if (quiz.deleted) {
          syncData.quizzes.delete(quiz.id);
        } else {
          syncData.quizzes.set(quiz.id, {
            ...quiz,
            syncId: quiz.id,
            syncVersion: (quiz.syncVersion || 0) + 1,
            lastSyncedAt: new Date().toISOString()
          });
          results.quizzes[quiz.syncId ? 'updated' : 'created']++;
        }
      } catch (error) {
        results.quizzes.failed++;
      }
    }

    res.json({
      success: true,
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Sync push error:', error);
    res.status(500).json({ error: 'Sync failed' });
  }
});

// POST /api/sync/pull - Pull changes from server
router.post('/pull', authMiddleware, async (req, res) => {
  try {
    const { lastSyncTime, includeAll = false } = req.body;
    const syncTimestamp = lastSyncTime ? new Date(lastSyncTime) : new Date(0);

    // Filter data modified after lastSyncTime
    const questions = Array.from(syncData.questions.values()).filter(q => 
      includeAll || !lastSyncTime || new Date(q.lastSyncedAt) > syncTimestamp
    );
    
    const categories = Array.from(syncData.categories.values()).filter(c => 
      includeAll || !lastSyncTime || new Date(c.lastSyncedAt) > syncTimestamp
    );
    
    const quizzes = Array.from(syncData.quizzes.values()).filter(q => 
      includeAll || !lastSyncTime || new Date(q.lastSyncedAt) > syncTimestamp
    );

    res.json({
      success: true,
      data: {
        questions,
        categories,
        quizzes
      },
      timestamp: new Date().toISOString(),
      hasMore: false
    });
  } catch (error) {
    console.error('Sync pull error:', error);
    res.status(500).json({ error: 'Sync failed' });
  }
});

// GET /api/sync/status - Check sync status
router.get('/status', authMiddleware, async (req, res) => {
  try {
    res.json({
      success: true,
      connected: true,
      serverTime: new Date().toISOString(),
      counts: {
        questions: syncData.questions.size,
        categories: syncData.categories.size,
        quizzes: syncData.quizzes.size
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Status check failed' });
  }
});

module.exports = router;
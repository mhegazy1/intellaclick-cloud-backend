const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Question = require('../models/Question');
const Category = require('../models/Category');
const Quiz = require('../models/Quiz');

// Helper function to process sync items
const processSyncItems = async (Model, items, userId, results) => {
  for (const item of items) {
    try {
      if (item.deleted) {
        // Soft delete
        const doc = await Model.findOne({ 
          syncId: item.id || item.syncId,
          userId 
        });
        
        if (doc) {
          await doc.softDelete();
          results.updated++;
        }
      } else {
        // Create or update
        const existingDoc = await Model.findOne({ 
          syncId: item.id || item.syncId,
          userId 
        });
        
        if (existingDoc) {
          // Update existing
          Object.assign(existingDoc, {
            ...item,
            syncId: item.id || item.syncId,
            syncVersion: (item.syncVersion || 0) + 1,
            lastSyncedAt: new Date(),
            userId
          });
          await existingDoc.save();
          results.updated++;
        } else {
          // Create new
          const newDoc = new Model({
            ...item,
            syncId: item.id || item.syncId,
            syncVersion: 1,
            lastSyncedAt: new Date(),
            userId
          });
          await newDoc.save();
          results.created++;
        }
      }
    } catch (error) {
      console.error(`Error processing ${Model.modelName}:`, error);
      results.failed++;
    }
  }
};

// POST /api/sync/push/v2 - Push changes from client
router.post('/push/v2', authMiddleware, async (req, res) => {
  try {
    console.log('Sync push received:', {
      questions: req.body.questions?.length || 0,
      categories: req.body.categories?.length || 0,
      quizzes: req.body.quizzes?.length || 0,
      userId: req.userId
    });

    const { questions = [], categories = [], quizzes = [] } = req.body;
    const results = {
      questions: { created: 0, updated: 0, failed: 0 },
      categories: { created: 0, updated: 0, failed: 0 },
      quizzes: { created: 0, updated: 0, failed: 0 }
    };

    // Process categories first (they might be referenced by questions)
    await processSyncItems(Category, categories, req.userId, results.categories);

    // Process questions
    await processSyncItems(Question, questions, req.userId, results.questions);

    // Process quizzes
    await processSyncItems(Quiz, quizzes, req.userId, results.quizzes);

    res.json({
      success: true,
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Sync push error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Sync failed',
      message: error.message 
    });
  }
});

// POST /api/sync/pull - Pull changes from server
router.post('/pull', authMiddleware, async (req, res) => {
  try {
    const { lastSyncTime } = req.body;
    const userId = req.userId;
    
    console.log('Sync pull request:', { userId, lastSyncTime });
    
    // Build query for changes since last sync
    const query = {
      userId,
      deleted: false
    };
    
    if (lastSyncTime) {
      query.updatedAt = { $gt: new Date(lastSyncTime) };
    }
    
    // Fetch all data for the user
    const [questions, categories, quizzes] = await Promise.all([
      Question.find(query).lean(),
      Category.find(query).lean(),
      Quiz.find(query).lean()
    ]);
    
    // Transform to match expected format
    const transformItem = (item) => ({
      ...item,
      id: item.syncId || item._id.toString(),
      syncId: item.syncId || item._id.toString()
    });
    
    res.json({
      success: true,
      data: {
        questions: questions.map(transformItem),
        categories: categories.map(transformItem),
        quizzes: quizzes.map(transformItem)
      },
      timestamp: new Date().toISOString(),
      hasMore: false
    });
  } catch (error) {
    console.error('Sync pull error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Pull failed',
      message: error.message 
    });
  }
});

// GET /api/sync/status - Get sync status
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    
    // Get counts
    const [questionCount, categoryCount, quizCount] = await Promise.all([
      Question.countDocuments({ userId, deleted: false }),
      Category.countDocuments({ userId, deleted: false }),
      Quiz.countDocuments({ userId, deleted: false })
    ]);
    
    // Get last sync time (latest update across all collections)
    const [lastQuestion, lastCategory, lastQuiz] = await Promise.all([
      Question.findOne({ userId }).sort({ updatedAt: -1 }).select('updatedAt'),
      Category.findOne({ userId }).sort({ updatedAt: -1 }).select('updatedAt'),
      Quiz.findOne({ userId }).sort({ updatedAt: -1 }).select('updatedAt')
    ]);
    
    const lastSyncDates = [
      lastQuestion?.updatedAt,
      lastCategory?.updatedAt,
      lastQuiz?.updatedAt
    ].filter(Boolean);
    
    const lastSyncTime = lastSyncDates.length > 0 
      ? new Date(Math.max(...lastSyncDates.map(d => d.getTime())))
      : null;
    
    res.json({
      success: true,
      status: {
        isOnline: true,
        lastSyncTime: lastSyncTime?.toISOString(),
        counts: {
          questions: questionCount,
          categories: categoryCount,
          quizzes: quizCount
        },
        hasUnsyncedChanges: false // Can be implemented with a separate tracking mechanism
      }
    });
  } catch (error) {
    console.error('Sync status error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Status check failed',
      message: error.message 
    });
  }
});

// DELETE /api/sync/reset - Reset all sync data for user (for testing)
router.delete('/reset', authMiddleware, async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ 
        success: false,
        error: 'Reset not allowed in production' 
      });
    }
    
    const userId = req.userId;
    
    // Delete all user data
    await Promise.all([
      Question.deleteMany({ userId }),
      Category.deleteMany({ userId }),
      Quiz.deleteMany({ userId })
    ]);
    
    res.json({
      success: true,
      message: 'All sync data reset'
    });
  } catch (error) {
    console.error('Sync reset error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Reset failed',
      message: error.message 
    });
  }
});

module.exports = router;
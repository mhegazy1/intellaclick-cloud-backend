const express = require('express');
const router = express.Router();
const QuestionSet = require('../models/QuestionSet');
const auth = require('../middleware/auth');

// Get all question sets for the authenticated instructor
router.get('/', auth, async (req, res) => {
  try {
    const instructorId = req.user.userId || req.user.id;

    const questionSets = await QuestionSet.find({ instructorId })
      .sort({ createdAt: -1 })
      .select('-__v');

    console.log(`[QuestionSets] Found ${questionSets.length} sets for instructor ${instructorId}`);

    res.json({
      success: true,
      questionSets
    });
  } catch (error) {
    console.error('[QuestionSets] Error fetching question sets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch question sets'
    });
  }
});

// Get a specific question set
router.get('/:id', auth, async (req, res) => {
  try {
    const instructorId = req.user.userId || req.user.id;
    const questionSet = await QuestionSet.findOne({
      _id: req.params.id,
      instructorId
    });

    if (!questionSet) {
      return res.status(404).json({
        success: false,
        error: 'Question set not found'
      });
    }

    res.json({
      success: true,
      questionSet
    });
  } catch (error) {
    console.error('[QuestionSets] Error fetching question set:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch question set'
    });
  }
});

// Create a new question set
router.post('/', auth, async (req, res) => {
  try {
    const instructorId = req.user.userId || req.user.id;
    const { name, questions, classId } = req.body;

    console.log(`[QuestionSets] Create request from instructor ${instructorId}:`, {
      name,
      questionCount: questions?.length,
      classId
    });

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Question set name is required'
      });
    }

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one question is required'
      });
    }

    // Check for duplicate: same name and similar questions within last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentDuplicate = await QuestionSet.findOne({
      instructorId,
      name: name.trim(),
      createdAt: { $gte: fiveMinutesAgo },
      questionCount: questions.length
    });

    if (recentDuplicate) {
      console.log(`[QuestionSets] Duplicate detected, returning existing set: ${recentDuplicate._id}`);
      return res.status(200).json({
        success: true,
        questionSet: recentDuplicate,
        isDuplicate: true
      });
    }

    const questionSet = new QuestionSet({
      name: name.trim(),
      instructorId,
      classId: classId || null,
      questions,
      questionCount: questions.length
    });

    await questionSet.save();

    console.log(`[QuestionSets] ✅ Created new set: ${questionSet._id} with ${questions.length} questions`);

    res.status(201).json({
      success: true,
      questionSet
    });
  } catch (error) {
    console.error('[QuestionSets] Error creating question set:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create question set'
    });
  }
});

// Update an existing question set
router.put('/:id', auth, async (req, res) => {
  try {
    const instructorId = req.user.userId || req.user.id;
    const { name, questions, classId } = req.body;

    const questionSet = await QuestionSet.findOne({
      _id: req.params.id,
      instructorId
    });

    if (!questionSet) {
      return res.status(404).json({
        success: false,
        error: 'Question set not found'
      });
    }

    if (name !== undefined) questionSet.name = name.trim();
    if (questions !== undefined) questionSet.questions = questions;
    if (classId !== undefined) questionSet.classId = classId;

    await questionSet.save();

    console.log(`[QuestionSets] Updated set: ${questionSet._id}`);

    res.json({
      success: true,
      questionSet
    });
  } catch (error) {
    console.error('[QuestionSets] Error updating question set:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update question set'
    });
  }
});

// Delete a question set
router.delete('/:id', auth, async (req, res) => {
  try {
    const instructorId = req.user.userId || req.user.id;

    const questionSet = await QuestionSet.findOneAndDelete({
      _id: req.params.id,
      instructorId
    });

    if (!questionSet) {
      return res.status(404).json({
        success: false,
        error: 'Question set not found'
      });
    }

    console.log(`[QuestionSets] Deleted set: ${req.params.id}`);

    res.json({
      success: true,
      message: 'Question set deleted successfully'
    });
  } catch (error) {
    console.error('[QuestionSets] Error deleting question set:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete question set'
    });
  }
});

// Get statistics for instructor's question sets
router.get('/stats/summary', auth, async (req, res) => {
  try {
    const instructorId = req.user.userId || req.user.id;

    const questionSets = await QuestionSet.find({ instructorId });

    const totalSets = questionSets.length;
    const totalQuestions = questionSets.reduce((sum, set) => sum + set.questionCount, 0);

    res.json({
      success: true,
      stats: {
        totalSets,
        totalQuestions
      }
    });
  } catch (error) {
    console.error('[QuestionSets] Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const Quiz = require('../models/Quiz');
const Question = require('../models/Question');
const auth = require('../middleware/auth');

// GET /api/quizzes - Get all quizzes for logged-in user
router.get('/', auth, async (req, res) => {
  try {
    const quizzes = await Quiz.find({
      userId: req.user.userId,
      deleted: false
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      quizzes
    });
  } catch (error) {
    console.error('Error fetching quizzes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quizzes'
    });
  }
});

// GET /api/quizzes/:id - Get single quiz by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const quiz = await Quiz.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      deleted: false
    });

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found'
      });
    }

    // Populate question details
    await quiz.populateQuestions();

    res.json({
      success: true,
      quiz
    });
  } catch (error) {
    console.error('Error fetching quiz:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quiz'
    });
  }
});

// POST /api/quizzes - Create new quiz
router.post('/', auth, async (req, res) => {
  try {
    const { title, description, settings, questions, sections, type } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Quiz title is required'
      });
    }

    const quiz = new Quiz({
      userId: req.user.userId,
      title: title.trim(),
      description: description || '',
      type: type || 'standard',
      settings: settings || {},
      questions: questions || [],
      sections: sections || []
    });

    await quiz.save();

    res.status(201).json({
      success: true,
      message: 'Quiz created successfully',
      quiz
    });
  } catch (error) {
    console.error('Error creating quiz:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create quiz'
    });
  }
});

// PUT /api/quizzes/:id - Update quiz
router.put('/:id', auth, async (req, res) => {
  try {
    const quiz = await Quiz.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      deleted: false
    });

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found'
      });
    }

    const { title, description, settings, questions, sections, type } = req.body;

    if (title !== undefined) quiz.title = title.trim();
    if (description !== undefined) quiz.description = description;
    if (settings !== undefined) quiz.settings = settings;
    if (questions !== undefined) quiz.questions = questions;
    if (sections !== undefined) quiz.sections = sections;
    if (type !== undefined) quiz.type = type;

    quiz.syncVersion = (quiz.syncVersion || 0) + 1;
    await quiz.save();

    res.json({
      success: true,
      message: 'Quiz updated successfully',
      quiz
    });
  } catch (error) {
    console.error('Error updating quiz:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update quiz'
    });
  }
});

// DELETE /api/quizzes/:id - Delete quiz (soft delete)
router.delete('/:id', auth, async (req, res) => {
  try {
    const quiz = await Quiz.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      deleted: false
    });

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found'
      });
    }

    await quiz.softDelete();

    res.json({
      success: true,
      message: 'Quiz deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting quiz:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete quiz'
    });
  }
});

// POST /api/quizzes/:id/duplicate - Duplicate a quiz
router.post('/:id/duplicate', auth, async (req, res) => {
  try {
    const quiz = await Quiz.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      deleted: false
    });

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found'
      });
    }

    const duplicatedQuiz = await quiz.duplicate(req.user.userId);

    res.status(201).json({
      success: true,
      message: 'Quiz duplicated successfully',
      quiz: duplicatedQuiz
    });
  } catch (error) {
    console.error('Error duplicating quiz:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to duplicate quiz'
    });
  }
});

module.exports = router;

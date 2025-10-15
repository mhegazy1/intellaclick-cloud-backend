const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');

// GET /api/users
router.get('/', async (req, res) => {
  res.json({ message: 'Users endpoint - coming soon' });
});

// GET /api/users/session-settings - Get user's default session settings
router.get('/session-settings', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id || req.user.userId);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Return session settings or defaults if not set
    const settings = user.sessionSettings || {
      allowAnonymous: false,
      openToAll: false,
      allowAnswerChange: false,
      showCorrectAnswer: false,
      enableGamification: true
    };

    res.json({ success: true, settings });
  } catch (error) {
    console.error('Error getting session settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/users/session-settings - Save user's default session settings
router.put('/session-settings', auth, async (req, res) => {
  try {
    const { allowAnonymous, openToAll, allowAnswerChange, showCorrectAnswer, enableGamification } = req.body;

    const user = await User.findById(req.user.id || req.user.userId);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Update session settings
    user.sessionSettings = {
      allowAnonymous: allowAnonymous !== undefined ? allowAnonymous : false,
      openToAll: openToAll !== undefined ? openToAll : false,
      allowAnswerChange: allowAnswerChange !== undefined ? allowAnswerChange : false,
      showCorrectAnswer: showCorrectAnswer !== undefined ? showCorrectAnswer : false,
      enableGamification: enableGamification !== undefined ? enableGamification : true
    };

    await user.save();

    res.json({ success: true, settings: user.sessionSettings });
  } catch (error) {
    console.error('Error saving session settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
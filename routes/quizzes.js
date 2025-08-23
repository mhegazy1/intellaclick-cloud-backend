const express = require('express');
const router = express.Router();

// GET /api/quizzes
router.get('/', async (req, res) => {
  res.json({ message: 'quizzes endpoint - coming soon' });
});

module.exports = router;

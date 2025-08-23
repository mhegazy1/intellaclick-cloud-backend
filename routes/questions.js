const express = require('express');
const router = express.Router();

// GET /api/questions
router.get('/', async (req, res) => {
  res.json({ message: 'questions endpoint - coming soon' });
});

module.exports = router;

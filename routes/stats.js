const express = require('express');
const router = express.Router();

// GET /api/stats
router.get('/', async (req, res) => {
  res.json({ message: 'stats endpoint - coming soon' });
});

module.exports = router;

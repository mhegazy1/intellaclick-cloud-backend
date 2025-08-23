const express = require('express');
const router = express.Router();

// GET /api/sessions
router.get('/', async (req, res) => {
  res.json({ message: 'sessions endpoint - coming soon' });
});

module.exports = router;

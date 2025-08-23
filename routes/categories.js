const express = require('express');
const router = express.Router();

// GET /api/categories
router.get('/', async (req, res) => {
  res.json({ message: 'categories endpoint - coming soon' });
});

module.exports = router;

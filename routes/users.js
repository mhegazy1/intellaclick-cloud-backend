const express = require('express');
const router = express.Router();

// GET /api/users
router.get('/', async (req, res) => {
  res.json({ message: 'Users endpoint - coming soon' });
});

module.exports = router;
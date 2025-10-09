const express = require('express');
const router = express.Router();
const User = require('../models/User');

// One-time setup route to create first admin
// This should be disabled after first use
router.post('/make-admin', async (req, res) => {
  try {
    const { email, setupKey } = req.body;

    // Simple security check - must provide setup key from environment
    const expectedKey = process.env.SETUP_KEY || 'intellaclick-setup-2025';

    if (setupKey !== expectedKey) {
      return res.status(403).json({ error: 'Invalid setup key' });
    }

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'Make sure you have an instructor account first'
      });
    }

    // Check if already admin
    if (user.role === 'admin') {
      return res.json({
        success: true,
        message: 'User is already an admin',
        user: {
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role
        }
      });
    }

    // Update to admin
    user.role = 'admin';
    await user.save();

    res.json({
      success: true,
      message: 'Successfully updated to admin role',
      user: {
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

module.exports = router;

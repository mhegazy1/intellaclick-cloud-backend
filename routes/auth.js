const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const auth = require('../middleware/auth');

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '7d' }
  );
};

// Generate refresh token
const generateRefreshToken = (userId) => {
  return jwt.sign(
    { userId, type: 'refresh' },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '30d' }
  );
};

// POST /api/auth/register
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('firstName').notEmpty().trim(),
  body('lastName').notEmpty().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, firstName, lastName, role = 'instructor' } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        error: 'User already exists' 
      });
    }

    // Create user (password will be hashed by the model)
    const user = new User({
      email,
      password,
      firstName,
      lastName,
      role
    });

    try {
      await user.save();
    } catch (saveError) {
      console.error('User save error:', saveError);
      if (saveError.name === 'ValidationError') {
        return res.status(400).json({ 
          error: 'Validation error', 
          details: saveError.message 
        });
      }
      throw saveError;
    }

    // Generate tokens
    const token = generateToken(user._id.toString());
    const refreshToken = generateRefreshToken(user._id.toString());

    res.json({
      success: true,
      token,
      refreshToken,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        joinedAt: user.createdAt || new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      error: 'Server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Registration failed'
    });
  }
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ 
        error: 'Invalid credentials' 
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ 
        error: 'Invalid credentials' 
      });
    }

    // Generate tokens
    const token = generateToken(user._id.toString());
    const refreshToken = generateRefreshToken(user._id.toString());

    res.json({
      success: true,
      token,
      refreshToken,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        joinedAt: user.createdAt || new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      error: 'Server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Login failed'
    });
  }
});

// GET /api/auth/me - Get current user (using auth middleware)
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Return in the format the frontend expects
    res.json({ 
      user: {
        id: user._id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        joinedAt: user.createdAt || new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET || 'dev-secret');
    
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    // Generate new tokens
    const token = generateToken(decoded.userId);
    const newRefreshToken = generateRefreshToken(decoded.userId);

    res.json({
      success: true,
      token,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// Removed duplicate /me route - already defined above

// GET /api/auth/user - Alias for /api/auth/me for backward compatibility
router.get('/user', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Return in the format the frontend expects (same as /me)
    res.json({ 
      user: {
        id: user._id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        joinedAt: user.createdAt || new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DEBUG endpoint - Remove in production!
if (process.env.NODE_ENV === 'development') {
  router.post('/debug/test-password', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      const user = await User.findOne({ email });
      if (!user) {
        return res.json({ 
          found: false,
          message: 'User not found'
        });
      }
      
      const isMatch = await user.comparePassword(password);
      
      res.json({
        found: true,
        email: user.email,
        hasPassword: !!user.password,
        passwordLength: user.password ? user.password.length : 0,
        passwordMatch: isMatch,
        passwordStartsWith: user.password ? user.password.substring(0, 10) + '...' : null,
        bcryptFormat: user.password ? user.password.startsWith('$2a$') || user.password.startsWith('$2b$') : false
      });
    } catch (error) {
      res.status(500).json({ 
        error: error.message,
        stack: error.stack
      });
    }
  });
}


// POST /api/auth/logout - Logout (just for frontend compatibility)
router.post('/logout', auth, async (req, res) => {
  // In a JWT system, logout is handled client-side by removing the token
  // This endpoint exists for frontend compatibility
  res.json({ success: true, message: 'Logged out successfully' });
});

// PUT /api/auth/profile - Update user profile
router.put('/profile', [
  auth,
  body('firstName').optional().trim(),
  body('lastName').optional().trim(),
  body('name').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Handle name field (split into firstName and lastName)
    if (req.body.name) {
      const nameParts = req.body.name.trim().split(' ');
      user.firstName = nameParts[0];
      user.lastName = nameParts.slice(1).join(' ') || nameParts[0];
    }
    
    // Handle individual fields
    if (req.body.firstName) user.firstName = req.body.firstName;
    if (req.body.lastName) user.lastName = req.body.lastName;
    
    await user.save();
    
    res.json({ 
      success: true,
      user: {
        id: user._id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        joinedAt: user.createdAt || new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
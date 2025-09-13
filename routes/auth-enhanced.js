const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const auth = require('../middleware/auth');

// ... (keeping all other routes the same) ...

// GET /api/auth/me - Get current user (using auth middleware) - ENHANCED VERSION
router.get('/me', auth, async (req, res) => {
  try {
    console.log('[/api/auth/me] Request received');
    console.log('[/api/auth/me] req.user:', req.user);
    
    // Check if req.user exists and has userId
    if (!req.user) {
      console.error('[/api/auth/me] No user object in request');
      return res.status(401).json({ 
        success: false, 
        error: 'No user information in request',
        debug: 'req.user is undefined'
      });
    }
    
    const userId = req.user.userId || req.user._id || req.user.id;
    console.log('[/api/auth/me] Looking for user with ID:', userId);
    
    if (!userId) {
      console.error('[/api/auth/me] No user ID found in request');
      return res.status(401).json({ 
        success: false, 
        error: 'No user ID in token',
        debug: {
          reqUser: req.user,
          hasUserId: !!req.user.userId,
          has_id: !!req.user._id,
          hasId: !!req.user.id
        }
      });
    }
    
    // Find user in database
    const user = await User.findById(userId).select('-password');
    console.log('[/api/auth/me] Database query result:', user ? 'User found' : 'User not found');
    
    if (!user) {
      console.error('[/api/auth/me] User not found in database for ID:', userId);
      return res.status(404).json({ 
        success: false, 
        error: 'User not found',
        debug: {
          searchedId: userId,
          idType: typeof userId
        }
      });
    }
    
    // Log user details for debugging
    console.log('[/api/auth/me] User details:', {
      id: user._id,
      email: user.email,
      role: user.role,
      hasRole: !!user.role,
      firstName: user.firstName,
      lastName: user.lastName
    });
    
    // Check if role is missing or invalid
    if (!user.role) {
      console.warn('[/api/auth/me] User has no role set:', user._id);
    }
    
    // Return in the format the frontend expects
    const response = {
      user: {
        id: user._id.toString(),
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role || 'NOT SET', // Explicitly show if role is missing
        joinedAt: user.createdAt || new Date().toISOString()
      }
    };
    
    console.log('[/api/auth/me] Sending response:', response);
    res.json(response);
    
  } catch (error) {
    console.error('[/api/auth/me] Error:', error);
    console.error('[/api/auth/me] Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      debug: process.env.NODE_ENV === 'development' ? {
        name: error.name,
        stack: error.stack
      } : undefined
    });
  }
});

module.exports = router;
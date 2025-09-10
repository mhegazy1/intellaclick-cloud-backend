const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Enhanced auth middleware that ensures user role is available
 * Handles tokens that don't include role information
 */
module.exports = async function(req, res, next) {
  // Get token from header - support both x-auth-token and Authorization Bearer
  let token = req.header('x-auth-token');
  
  // If no x-auth-token, check Authorization header
  if (!token) {
    const authHeader = req.header('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  // Check if no token
  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    
    // Handle different token formats
    let userId;
    let userFromToken;
    
    if (decoded.user) {
      // Token contains full user object
      userFromToken = decoded.user;
      userId = decoded.user._id || decoded.user.id || decoded.user.userId;
    } else if (decoded.userId) {
      // Token only contains userId (your case)
      userId = decoded.userId;
    } else if (decoded.id) {
      // Token contains id
      userId = decoded.id;
    }
    
    if (!userId) {
      return res.status(401).json({ msg: 'Invalid token structure' });
    }
    
    // If we have full user info with role from token, use it
    if (userFromToken && userFromToken.role) {
      req.user = userFromToken;
      req.user._id = userId; // Ensure _id is set
      return next();
    }
    
    // Otherwise, fetch user from database to get role
    try {
      const user = await User.findById(userId).select('-password');
      
      if (!user) {
        return res.status(401).json({ msg: 'User not found' });
      }
      
      // Set user on request with all necessary fields
      req.user = {
        _id: user._id,
        userId: user._id, // Include both formats
        id: user._id,      // Include all possible formats
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        // Include any other user fields that might be needed
        createdAt: user.createdAt
      };
      
      next();
    } catch (dbError) {
      console.error('Error fetching user from database:', dbError);
      return res.status(500).json({ msg: 'Error validating token' });
    }
    
  } catch (err) {
    console.error('Token verification error:', err);
    res.status(401).json({ msg: 'Token is not valid' });
  }
};
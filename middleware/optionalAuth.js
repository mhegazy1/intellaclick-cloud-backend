const jwt = require('jsonwebtoken');

/**
 * Optional authentication middleware
 * Validates and decodes JWT token if present, but allows requests without tokens
 * Useful for endpoints that support both authenticated and anonymous users
 */
module.exports = function(req, res, next) {
  // Get token from header - support both x-auth-token and Authorization Bearer
  let token = req.header('x-auth-token');

  // If no x-auth-token, check Authorization header
  if (!token) {
    const authHeader = req.header('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  // If no token, continue without setting req.user
  if (!token) {
    return next();
  }

  // Verify token
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');

    // Handle different token formats
    if (decoded.user) {
      // Token contains full user object
      req.user = decoded.user;
      // Ensure _id is set for consistency
      if (!req.user._id && (req.user.id || req.user.userId)) {
        req.user._id = req.user.id || req.user.userId;
      }
    } else if (decoded.userId) {
      // Token only contains userId - create a proper user object
      req.user = {
        _id: decoded.userId,
        id: decoded.userId,
        userId: decoded.userId
      };
    } else if (decoded.id) {
      // Token contains id
      req.user = {
        _id: decoded.id,
        id: decoded.id,
        userId: decoded.id
      };
    } else {
      // Invalid token structure - log but continue
      console.warn('[OptionalAuth] Unexpected token format:', decoded);
      return next();
    }

    next();
  } catch (err) {
    // Invalid token - log but continue without authentication
    console.warn('[OptionalAuth] Token verification failed:', err.message);
    next();
  }
};

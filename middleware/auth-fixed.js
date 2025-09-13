const jwt = require('jsonwebtoken');

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

  // Check if no token
  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
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
      // Fallback - try to extract any user identifier
      console.error('Unexpected token format:', decoded);
      return res.status(401).json({ msg: 'Invalid token structure' });
    }
    
    next();
  } catch (err) {
    console.error('Token verification error:', err);
    res.status(401).json({ msg: 'Token is not valid' });
  }
};
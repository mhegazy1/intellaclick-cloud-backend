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
    // Handle both decoded.user and decoded.userId formats
    req.user = decoded.user || { userId: decoded.userId };
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};
module.exports = function(req, res, next) {
  // This middleware should be used after the auth middleware
  // which sets req.user
  
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // For student routes, we need to check if the authenticated user
  // is accessing via the student auth system
  
  // Check if user type is student (from JWT payload)
  if (req.user.type !== 'student') {
    return res.status(403).json({ 
      error: 'Access denied. Student account required.',
      userType: req.user.type,
      hint: 'Please login with your student account'
    });
  }
  
  next();
};
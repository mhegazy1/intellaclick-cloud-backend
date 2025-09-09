module.exports = function(req, res, next) {
  // This middleware should be used after the auth middleware
  // which sets req.user
  
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Check if user has instructor role
  const allowedRoles = ['instructor', 'admin'];
  
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ 
      error: 'Access denied. Instructor privileges required.',
      userRole: req.user.role,
      requiredRoles: allowedRoles
    });
  }
  
  next();
};
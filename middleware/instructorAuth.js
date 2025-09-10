module.exports = async function(req, res, next) {
  // This middleware should be used after the auth middleware
  // which sets req.user
  
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // If role is missing from req.user, fetch it from database
  if (!req.user.role && (req.user._id || req.user.userId)) {
    try {
      const User = require('../models/User');
      const userId = req.user._id || req.user.userId;
      const user = await User.findById(userId).select('role email firstName lastName');
      
      if (user) {
        req.user.role = user.role;
        req.user.email = user.email;
        req.user.firstName = user.firstName;
        req.user.lastName = user.lastName;
      }
    } catch (error) {
      console.error('Error fetching user role:', error);
    }
  }
  
  // Check if user has instructor role
  // Expanded to include common variations
  const allowedRoles = [
    'instructor', 
    'admin', 
    'teacher', 
    'professor', 
    'faculty',
    'teaching_assistant',
    'user' // Temporary: allow generic 'user' role for backward compatibility
  ];
  
  // Case-insensitive role check
  const userRole = req.user.role?.toLowerCase();
  const hasAccess = allowedRoles.some(role => userRole === role.toLowerCase());
  
  if (!hasAccess) {
    console.log('Instructor auth denied:', {
      userRole: req.user.role,
      userId: req.user._id || req.user.userId,
      email: req.user.email
    });
    
    return res.status(403).json({ 
      error: 'Access denied. Instructor privileges required.',
      userRole: req.user.role,
      requiredRoles: allowedRoles
    });
  }
  
  next();
};
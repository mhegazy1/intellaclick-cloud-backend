/**
 * Enhanced Instructor Authentication Middleware
 * 
 * This middleware provides flexible role-based access control for instructor-level operations.
 * It supports multiple instructor-type roles and provides detailed logging for debugging.
 */

module.exports = function(req, res, next) {
  // This middleware should be used after the auth middleware
  // which sets req.user
  
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'You must be logged in to access this resource'
    });
  }
  
  // Define allowed roles for instructor-level access
  // This is more flexible than hardcoding just 'instructor'
  const instructorRoles = [
    'instructor',
    'teacher',
    'professor',
    'faculty',
    'admin',
    'teaching_assistant',
    'ta'
  ];
  
  // Also check for role variations (case-insensitive)
  const userRole = req.user.role?.toLowerCase();
  const hasInstructorAccess = instructorRoles.some(role => 
    userRole === role || userRole === role.toLowerCase()
  );
  
  // Special case: if user created classes before role system was strict
  // Check if they have any existing classes
  const checkExistingInstructor = async () => {
    try {
      const Class = require('../models/Class');
      const existingClass = await Class.findOne({ 
        instructorId: req.user._id || req.user.userId 
      });
      
      if (existingClass) {
        // User has created classes before, grant access
        console.log(`User ${req.user.email} has existing classes, granting instructor access`);
        return true;
      }
    } catch (error) {
      console.error('Error checking existing classes:', error);
    }
    return false;
  };
  
  // If user doesn't have standard instructor role, check if they have classes
  if (!hasInstructorAccess) {
    // For async check, we need to handle it properly
    checkExistingInstructor().then(hasClasses => {
      if (hasClasses) {
        next();
      } else {
        // Log detailed information for debugging
        console.log('Access denied for user:', {
          userId: req.user._id || req.user.userId,
          email: req.user.email,
          role: req.user.role,
          requestedPath: req.path,
          method: req.method
        });
        
        return res.status(403).json({ 
          error: 'Access denied. Instructor privileges required.',
          userRole: req.user.role,
          acceptedRoles: instructorRoles,
          message: 'Your account role does not have instructor privileges. Please contact an administrator to update your role.'
        });
      }
    }).catch(err => {
      console.error('Error in instructor auth middleware:', err);
      res.status(500).json({ 
        error: 'Internal server error checking permissions' 
      });
    });
  } else {
    // User has instructor role, proceed
    next();
  }
};

/**
 * Utility function to upgrade a user's role to instructor
 * This can be called from an admin endpoint
 */
module.exports.upgradeToInstructor = async function(userId) {
  try {
    const User = require('../models/User');
    const user = await User.findByIdAndUpdate(
      userId,
      { role: 'instructor' },
      { new: true }
    );
    
    if (!user) {
      throw new Error('User not found');
    }
    
    return {
      success: true,
      user: {
        id: user._id,
        email: user.email,
        role: user.role
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};
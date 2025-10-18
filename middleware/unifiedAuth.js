const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Student = require('../models/Student');

/**
 * Unified auth middleware that works with both User (instructor) and Student tokens
 */
module.exports = async function(req, res, next) {
  // Get token from header - support both x-auth-token and Authorization Bearer
  let token = req.header('x-auth-token');
  
  if (!token) {
    const authHeader = req.header('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');

    console.log('[unifiedAuth] Token decoded:', {
      type: decoded.type,
      userId: decoded.userId,
      hasType: !!decoded.type,
      typeValue: decoded.type,
      isStudent: decoded.type === 'student'
    });

    // Check if it's a student token
    if (decoded.type === 'student' && decoded.userId) {
      try {
        const student = await Student.findById(decoded.userId).select('-password');
        
        if (!student) {
          return res.status(401).json({ msg: 'Student not found' });
        }
        
        req.user = {
          _id: student._id,
          userId: student._id,
          id: student._id,
          email: student.email,
          firstName: student.profile?.firstName,
          lastName: student.profile?.lastName,
          type: 'student',
          isStudent: true
        };
        
        return next();
      } catch (dbError) {
        console.error('Error fetching student:', dbError);
        return res.status(500).json({ msg: 'Error validating token' });
      }
    }
    
    // Otherwise, treat as instructor/user token
    let userId;
    if (decoded.user) {
      userId = decoded.user._id || decoded.user.id || decoded.user.userId;
    } else if (decoded.userId) {
      userId = decoded.userId;
    } else if (decoded.id) {
      userId = decoded.id;
    }
    
    if (!userId) {
      return res.status(401).json({ msg: 'Invalid token structure' });
    }
    
    try {
      const user = await User.findById(userId).select('-password');
      
      if (!user) {
        return res.status(401).json({ msg: 'User not found' });
      }
      
      req.user = {
        _id: user._id,
        userId: user._id,
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        type: 'user',
        isStudent: false
      };
      
      next();
    } catch (dbError) {
      console.error('Error fetching user:', dbError);
      return res.status(500).json({ msg: 'Error validating token' });
    }
    
  } catch (err) {
    console.error('Token verification error:', err);
    res.status(401).json({ msg: 'Token is not valid' });
  }
};
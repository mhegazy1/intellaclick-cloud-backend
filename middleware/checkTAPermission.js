const TAPermissions = require('../models/TAPermissions');
const Class = require('../models/Class');

/**
 * Middleware factory to check specific TA permissions
 * @param {string} category - Permission category (session, question, student, analytics, content, admin)
 * @param {string} permission - Specific permission within category
 * @param {boolean} allowInstructor - Whether to automatically allow instructors (default: true)
 */
function checkTAPermission(category, permission, allowInstructor = true) {
  return async (req, res, next) => {
    try {
      const userId = req.user._id || req.user.userId;
      const classId = req.params.classId || req.body.classId;
      
      if (!classId) {
        return res.status(400).json({
          success: false,
          error: 'Class ID is required'
        });
      }
      
      // First check if user is the instructor (owner) of the class
      if (allowInstructor) {
        const classDoc = await Class.findById(classId);
        if (!classDoc) {
          return res.status(404).json({
            success: false,
            error: 'Class not found'
          });
        }
        
        // Check if user is instructor or co-instructor
        if (classDoc.instructorId.toString() === userId.toString() ||
            (classDoc.coInstructors && classDoc.coInstructors.some(id => id.toString() === userId.toString()))) {
          // Instructor has all permissions
          req.userRole = 'instructor';
          req.class = classDoc;
          return next();
        }
      }
      
      // Check if user is a TA with specific permission
      const taPermissions = await TAPermissions.getPermissionsFor(userId, classId);
      
      if (!taPermissions) {
        return res.status(403).json({
          success: false,
          error: 'Access denied. You do not have permission to access this class.',
          requiredPermission: `${category}.${permission}`
        });
      }
      
      // Check specific permission
      if (!taPermissions.hasPermission(category, permission)) {
        return res.status(403).json({
          success: false,
          error: `Access denied. You do not have the required permission: ${permission}`,
          requiredPermission: `${category}.${permission}`,
          yourRole: 'teaching_assistant'
        });
      }
      
      // TA has permission
      req.userRole = 'teaching_assistant';
      req.taPermissions = taPermissions;
      req.class = await Class.findById(classId);
      next();
      
    } catch (error) {
      console.error('Error checking TA permission:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to verify permissions'
      });
    }
  };
}

/**
 * Middleware to check if user has any access to a class (instructor or TA)
 */
checkTAPermission.hasClassAccess = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.userId;
    const classId = req.params.classId || req.body.classId;
    
    if (!classId) {
      return res.status(400).json({
        success: false,
        error: 'Class ID is required'
      });
    }
    
    const classDoc = await Class.findById(classId);
    if (!classDoc) {
      return res.status(404).json({
        success: false,
        error: 'Class not found'
      });
    }
    
    // Check if instructor
    if (classDoc.instructorId.toString() === userId.toString() ||
        (classDoc.coInstructors && classDoc.coInstructors.some(id => id.toString() === userId.toString()))) {
      req.userRole = 'instructor';
      req.class = classDoc;
      return next();
    }
    
    // Check if TA
    const taPermissions = await TAPermissions.getPermissionsFor(userId, classId);
    if (taPermissions) {
      req.userRole = 'teaching_assistant';
      req.taPermissions = taPermissions;
      req.class = classDoc;
      return next();
    }
    
    // No access
    res.status(403).json({
      success: false,
      error: 'Access denied. You do not have permission to access this class.'
    });
    
  } catch (error) {
    console.error('Error checking class access:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify access'
    });
  }
};

/**
 * List of all available permissions for UI
 */
checkTAPermission.availablePermissions = {
  session: {
    canCreateSessions: 'Create live clicker sessions',
    canEndSessions: 'End active sessions',
    canViewSessionResults: 'View session results',
    canExportSessionData: 'Export session data'
  },
  question: {
    canViewQuestions: 'View questions',
    canCreateQuestions: 'Create new questions',
    canEditQuestions: 'Edit existing questions',
    canDeleteQuestions: 'Delete questions'
  },
  student: {
    canViewRoster: 'View class roster',
    canViewStudentScores: 'View student scores',
    canModifyGrades: 'Modify grades',
    canAddStudents: 'Add students to class',
    canRemoveStudents: 'Remove students from class',
    canViewStudentContact: 'View student contact info'
  },
  analytics: {
    canViewClassAnalytics: 'View class analytics',
    canViewIndividualAnalytics: 'View individual student analytics',
    canGenerateReports: 'Generate reports',
    canViewGamificationData: 'View gamification data'
  },
  content: {
    canViewQuizzes: 'View quizzes',
    canCreateQuizzes: 'Create quizzes',
    canEditQuizzes: 'Edit quizzes',
    canScheduleQuizzes: 'Schedule quizzes'
  },
  admin: {
    canModifyClassSettings: 'Modify class settings',
    canManageOtherTAs: 'Manage other TAs',
    canViewAuditLog: 'View audit log'
  }
};

module.exports = checkTAPermission;
const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const studentAuth = require('../middleware/studentAuth');
const unifiedAuth = require('../middleware/unifiedAuth');
const Class = require('../models/Class');
const ClassEnrollment = require('../models/ClassEnrollment');
const ClassInvitation = require('../models/ClassInvitation');
const Student = require('../models/Student');
const multer = require('multer');
const csv = require('csv-parse');
const fuzzy = require('fuzzyset.js');

// Configure multer for CSV uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'text/csv' && !file.originalname.endsWith('.csv')) {
      return cb(new Error('Only CSV files are allowed'));
    }
    cb(null, true);
  }
});

// POST /api/enrollment/join - Join class with join code
router.post('/join', auth, [
  body('joinCode').notEmpty().trim().toUpperCase()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { joinCode } = req.body;
    
    // Find class by join code
    const classDoc = await Class.findOne({ joinCode })
      .populate('instructorId', 'firstName lastName email');
    
    if (!classDoc) {
      return res.status(404).json({ error: 'Invalid join code' });
    }
    
    // Check if join code is valid
    if (!classDoc.isJoinCodeValid()) {
      return res.status(400).json({ error: 'Join code has expired or reached usage limit' });
    }
    
    // Check if enrollment is open
    if (!classDoc.isEnrollmentOpen()) {
      return res.status(400).json({ error: 'Enrollment is closed for this class' });
    }
    
    // Get student info
    const student = await Student.findById(req.user.id);
    if (!student) {
      return res.status(404).json({ error: 'Student account not found' });
    }
    
    // Check if already enrolled
    const existingEnrollment = await ClassEnrollment.findOne({
      classId: classDoc._id,
      studentId: student._id
    });
    
    if (existingEnrollment) {
      if (existingEnrollment.status === 'enrolled') {
        return res.status(400).json({ 
          error: 'You are already enrolled in this class',
          enrollment: existingEnrollment
        });
      }
      
      if (existingEnrollment.status === 'blocked') {
        return res.status(403).json({ error: 'You have been blocked from this class' });
      }
      
      // Re-enroll if dropped/withdrawn
      existingEnrollment.status = classDoc.requireApproval ? 'pending' : 'enrolled';
      existingEnrollment.enrolledAt = new Date();
      existingEnrollment.enrollmentMethod = 'join_code';
      await existingEnrollment.save();
      
      // Update join code usage
      classDoc.joinCodeUsageCount += 1;
      await classDoc.save();
      await classDoc.updateEnrollmentStats();
      
      return res.json({
        success: true,
        enrollment: existingEnrollment,
        class: classDoc,
        message: classDoc.requireApproval 
          ? 'Enrollment pending instructor approval' 
          : 'Successfully re-enrolled in class'
      });
    }
    
    // Create new enrollment
    const enrollment = new ClassEnrollment({
      classId: classDoc._id,
      studentId: student._id,
      enrollmentMethod: 'join_code',
      status: classDoc.requireApproval ? 'pending' : 'enrolled'
    });
    
    await enrollment.save();
    
    // Update join code usage
    classDoc.joinCodeUsageCount += 1;
    await classDoc.save();
    await classDoc.updateEnrollmentStats();
    
    res.json({
      success: true,
      enrollment,
      class: classDoc,
      message: classDoc.requireApproval 
        ? 'Enrollment pending instructor approval' 
        : 'Successfully enrolled in class'
    });
  } catch (error) {
    console.error('Error joining class:', error);
    res.status(500).json({ error: 'Failed to join class' });
  }
});

// GET /api/enrollment/my-classes-unified - Get student's enrolled classes (unified auth)
router.get('/my-classes-unified', unifiedAuth, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id || req.user.userId;
    console.log('Fetching classes with unified auth for user:', userId, 'isStudent:', req.user.isStudent);
    
    // If it's a student, use their ID directly
    // If it's an instructor testing, find their linked student account
    let studentId = userId;
    if (!req.user.isStudent) {
      const linkedStudent = await Student.findOne({ email: req.user.email });
      if (linkedStudent) {
        studentId = linkedStudent._id;
      }
    }
    
    const enrollments = await ClassEnrollment.find({
      studentId: studentId,
      status: { $in: ['enrolled', 'pending'] }
    })
    .populate({
      path: 'classId',
      populate: {
        path: 'instructorId',
        select: 'firstName lastName email'
      }
    })
    .sort({ enrolledAt: -1 });
    
    console.log('Found enrollments:', enrollments.length);
    
    const classes = enrollments.map(enrollment => ({
      enrollmentId: enrollment._id,
      status: enrollment.status,
      enrolledAt: enrollment.enrolledAt,
      lastActivity: enrollment.lastActivityAt,
      stats: enrollment.stats,
      academicInfo: enrollment.academicInfo,
      class: enrollment.classId
    }));
    
    res.json({ classes });
  } catch (error) {
    console.error('Error fetching enrolled classes (unified):', error);
    res.status(500).json({ error: 'Failed to fetch classes' });
  }
});

// GET /api/enrollment/my-classes - Get student's enrolled classes
router.get('/my-classes', auth, studentAuth, async (req, res) => {
  try {
    const studentId = req.user._id || req.user.id || req.user.userId;
    console.log('Fetching classes for student:', studentId);
    
    const enrollments = await ClassEnrollment.find({
      studentId: studentId,
      status: { $in: ['enrolled', 'pending'] }
    })
    .populate({
      path: 'classId',
      populate: {
        path: 'instructorId',
        select: 'firstName lastName email'
      }
    })
    .sort({ enrolledAt: -1 });
    
    console.log('Found enrollments for student:', {
      studentId,
      count: enrollments.length,
      enrollments: enrollments.map(e => ({
        id: e._id,
        status: e.status,
        classId: e.classId?._id
      }))
    });
    
    const classes = enrollments.map(enrollment => ({
      enrollmentId: enrollment._id,
      status: enrollment.status,
      enrolledAt: enrollment.enrolledAt,
      lastActivity: enrollment.lastActivityAt,
      stats: enrollment.stats,
      academicInfo: enrollment.academicInfo,
      class: enrollment.classId
    }));
    
    res.json({ classes });
  } catch (error) {
    console.error('Error fetching enrolled classes:', error);
    res.status(500).json({ error: 'Failed to fetch classes' });
  }
});

// GET /api/enrollment/test - Test endpoint to verify router is mounted
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Enrollment router is working!',
    endpoints: [
      'POST /api/enrollment/join',
      'GET /api/enrollment/my-classes',
      'GET /api/enrollment/class/:classId/students',
      'POST /api/enrollment/drop-unified/:enrollmentId',
      'POST /api/enrollment/drop/:enrollmentId'
    ]
  });
});

// GET /api/enrollment/test/:enrollmentId - Test enrollment ID validation
router.get('/test/:enrollmentId', (req, res) => {
  const { enrollmentId } = req.params;
  const mongoose = require('mongoose');
  
  res.json({
    enrollmentId,
    length: enrollmentId.length,
    isValidObjectId: mongoose.Types.ObjectId.isValid(enrollmentId),
    regex: /^[0-9a-fA-F]{24}$/.test(enrollmentId)
  });
});

// POST /api/enrollment/test-drop/:enrollmentId - Test drop endpoint without validation
router.post('/test-drop/:enrollmentId', (req, res) => {
  console.log('Test drop endpoint hit:', {
    enrollmentId: req.params.enrollmentId,
    headers: req.headers,
    body: req.body,
    method: req.method,
    url: req.url
  });
  
  res.json({
    message: 'Test drop endpoint reached successfully',
    enrollmentId: req.params.enrollmentId,
    timestamp: new Date().toISOString()
  });
});

// GET /api/enrollment/debug/:enrollmentId - Debug enrollment lookup
router.get('/debug/:enrollmentId', async (req, res) => {
  try {
    const enrollment = await ClassEnrollment.findById(req.params.enrollmentId)
      .populate('classId')
      .populate('studentId');
    
    if (!enrollment) {
      return res.json({
        found: false,
        enrollmentId: req.params.enrollmentId
      });
    }
    
    res.json({
      found: true,
      enrollment: {
        _id: enrollment._id,
        studentId: enrollment.studentId?._id,
        studentEmail: enrollment.studentId?.email,
        classId: enrollment.classId?._id,
        className: enrollment.classId?.name,
        status: enrollment.status,
        enrolledAt: enrollment.enrolledAt
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/enrollment/debug/class/:classId/roster - Debug roster endpoint
router.get('/debug/class/:classId/roster', async (req, res) => {
  try {
    const { classId } = req.params;
    
    // First check if class exists
    const classDoc = await Class.findById(classId);
    if (!classDoc) {
      return res.json({
        error: 'Class not found',
        classId: classId
      });
    }
    
    // Get all enrollments for this class
    const enrollments = await ClassEnrollment.find({ classId: classId })
      .populate('studentId', 'email profile');
    
    // Get enrollment count by status
    const statusCounts = {};
    enrollments.forEach(e => {
      statusCounts[e.status] = (statusCounts[e.status] || 0) + 1;
    });
    
    res.json({
      classInfo: {
        id: classDoc._id,
        name: classDoc.name,
        instructorId: classDoc.instructorId
      },
      enrollmentStats: {
        total: enrollments.length,
        byStatus: statusCounts
      },
      enrollments: enrollments.map(e => ({
        _id: e._id,
        status: e.status,
        studentId: e.studentId?._id,
        studentEmail: e.studentId?.email,
        studentName: e.studentId?.profile ? 
          `${e.studentId.profile.firstName} ${e.studentId.profile.lastName}` : 
          'No profile data',
        hasStudentData: !!e.studentId,
        enrolledAt: e.enrolledAt
      }))
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      stack: error.stack
    });
  }
});

// POST /api/enrollment/drop-unified/:enrollmentId - Drop from class (unified auth)
router.post('/drop-unified/:enrollmentId', unifiedAuth, async (req, res) => {
  try {
    console.log('[DROP-UNIFIED] Start drop request:', {
      enrollmentId: req.params.enrollmentId,
      user: {
        email: req.user.email,
        isStudent: req.user.isStudent,
        id: req.user._id || req.user.id || req.user.userId
      }
    });
    
    const userId = req.user._id || req.user.id || req.user.userId;
    let studentId = userId;
    
    // If it's an instructor, find their linked student account
    if (!req.user.isStudent) {
      console.log('[DROP-UNIFIED] User is instructor, looking for linked student account...');
      const linkedStudent = await Student.findOne({ email: req.user.email });
      if (linkedStudent) {
        studentId = linkedStudent._id;
        console.log('[DROP-UNIFIED] Found linked student account:', studentId);
      } else {
        console.log('[DROP-UNIFIED] No linked student account found');
        return res.status(400).json({ 
          error: 'No student account found for this email',
          hint: 'Please ensure you have enrolled in the class using this email'
        });
      }
    }
    
    console.log('[DROP-UNIFIED] Looking up enrollment...');
    const enrollment = await ClassEnrollment.findOne({
      _id: req.params.enrollmentId,
      studentId: studentId
    }).populate('classId');
    
    if (!enrollment) {
      // Debug: find the enrollment regardless of student
      const anyEnrollment = await ClassEnrollment.findById(req.params.enrollmentId)
        .populate('studentId', 'email');
      
      console.log('[DROP-UNIFIED] Enrollment not found for student. Debug info:', {
        requestedEnrollmentId: req.params.enrollmentId,
        requestedStudentId: studentId,
        actualEnrollment: anyEnrollment ? {
          id: anyEnrollment._id,
          studentEmail: anyEnrollment.studentId?.email,
          studentId: anyEnrollment.studentId?._id
        } : 'Not found'
      });
      
      return res.status(404).json({ 
        error: 'Enrollment not found',
        debug: {
          enrollmentId: req.params.enrollmentId,
          userEmail: req.user.email,
          isInstructor: !req.user.isStudent
        }
      });
    }
    
    console.log('[DROP-UNIFIED] Found enrollment:', {
      id: enrollment._id,
      status: enrollment.status,
      className: enrollment.classId?.name
    });
    
    if (enrollment.status !== 'enrolled') {
      return res.status(400).json({ 
        error: 'Cannot drop from class with current status',
        currentStatus: enrollment.status
      });
    }
    
    // Check if past drop deadline
    const classDoc = enrollment.classId;
    if (!classDoc) {
      console.error('[DROP-UNIFIED] Class document not populated!');
      return res.status(500).json({ error: 'Class information not found' });
    }
    
    if (classDoc.enrollmentDeadline && new Date() > classDoc.enrollmentDeadline) {
      return res.status(400).json({ error: 'Drop deadline has passed' });
    }
    
    console.log('[DROP-UNIFIED] Executing drop...');
    
    // Simple status update instead of using the drop method
    enrollment.status = 'dropped';
    enrollment.droppedAt = new Date();
    if (enrollment.metadata) {
      enrollment.metadata.set('dropReason', 'student_initiated');
    }
    
    await enrollment.save();
    console.log('[DROP-UNIFIED] Enrollment saved with dropped status');
    
    // Update class stats
    if (classDoc.updateEnrollmentStats) {
      await classDoc.updateEnrollmentStats();
      console.log('[DROP-UNIFIED] Class stats updated');
    }
    
    res.json({
      success: true,
      message: 'Successfully dropped from class'
    });
  } catch (error) {
    console.error('[DROP-UNIFIED] Error:', error);
    res.status(500).json({ 
      error: 'Failed to drop class',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// POST /api/enrollment/drop/:enrollmentId - Drop from class
router.post('/drop/:enrollmentId', auth, studentAuth, async (req, res) => {
  try {
    
    const enrollment = await ClassEnrollment.findOne({
      _id: req.params.enrollmentId,
      studentId: req.user.id
    }).populate('classId');
    
    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }
    
    if (enrollment.status !== 'enrolled') {
      return res.status(400).json({ error: 'Cannot drop from class with current status' });
    }
    
    // Check if past drop deadline
    const classDoc = enrollment.classId;
    if (classDoc.enrollmentDeadline && new Date() > classDoc.enrollmentDeadline) {
      return res.status(400).json({ error: 'Drop deadline has passed' });
    }
    
    const reason = req.body?.reason || 'student_initiated';
    console.log('Dropping enrollment with reason:', reason);
    await enrollment.drop(reason);
    await classDoc.updateEnrollmentStats();
    
    res.json({
      success: true,
      message: 'Successfully dropped from class'
    });
  } catch (error) {
    console.error('Error dropping class:', error);
    res.status(500).json({ error: 'Failed to drop class' });
  }
});

// POST /api/enrollment/invitation/:token - Accept invitation
router.post('/invitation/:token', auth, studentAuth, param('token').notEmpty(), async (req, res) => {
  try {
    const invitation = await ClassInvitation.findByToken(req.params.token)
      .populate('classId');
    
    if (!invitation) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }
    
    const student = await Student.findById(req.user.id);
    
    // Verify email matches (case-insensitive)
    if (student.email.toLowerCase() !== invitation.email.toLowerCase()) {
      return res.status(403).json({ 
        error: 'This invitation was sent to a different email address',
        invitationEmail: invitation.email
      });
    }
    
    // Check if already enrolled
    const existingEnrollment = await ClassEnrollment.findOne({
      classId: invitation.classId._id,
      studentId: student._id
    });
    
    if (existingEnrollment && existingEnrollment.status === 'enrolled') {
      return res.status(400).json({ 
        error: 'You are already enrolled in this class'
      });
    }
    
    // Create or update enrollment
    let enrollment;
    if (existingEnrollment) {
      existingEnrollment.status = 'enrolled';
      existingEnrollment.enrolledAt = new Date();
      existingEnrollment.enrollmentMethod = 'invitation';
      enrollment = await existingEnrollment.save();
    } else {
      enrollment = await ClassEnrollment.create({
        classId: invitation.classId._id,
        studentId: student._id,
        enrollmentMethod: 'invitation',
        status: 'enrolled'
      });
    }
    
    // Accept invitation
    await invitation.accept(student._id);
    
    // Update class stats
    const classDoc = await Class.findById(invitation.classId._id);
    await classDoc.updateEnrollmentStats();
    
    res.json({
      success: true,
      enrollment,
      class: invitation.classId,
      message: 'Successfully joined class'
    });
  } catch (error) {
    console.error('Error accepting invitation:', error);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

// Instructor routes for managing enrollment
const instructorAuth = require('../middleware/instructorAuth');

// POST /api/classes/:classId/upload-roster - Upload CSV roster
router.post('/class/:classId/upload-roster', 
  auth, 
  instructorAuth, 
  param('classId').isMongoId(),
  upload.single('roster'),
  async (req, res) => {
  try {
    const classDoc = await Class.findById(req.params.classId);
    
    if (!classDoc) {
      return res.status(404).json({ error: 'Class not found' });
    }
    
    if (classDoc.instructorId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Parse CSV
    const records = [];
    const parser = csv.parse({
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
    
    parser.on('readable', function() {
      let record;
      while (record = parser.read()) {
        records.push(record);
      }
    });
    
    parser.on('error', function(err) {
      console.error('CSV parsing error:', err);
      return res.status(400).json({ error: 'Invalid CSV format' });
    });
    
    parser.write(req.file.buffer);
    parser.end();
    
    parser.on('end', async function() {
      try {
        // Process roster data
        const results = await processRosterUpload(classDoc, records, req.user.id);
        
        res.json({
          success: true,
          summary: results.summary,
          matches: results.matches,
          invitations: results.invitations
        });
      } catch (error) {
        console.error('Roster processing error:', error);
        res.status(500).json({ error: 'Failed to process roster' });
      }
    });
  } catch (error) {
    console.error('Error uploading roster:', error);
    res.status(500).json({ error: 'Failed to upload roster' });
  }
});

// POST /api/enrollment/:enrollmentId/approve - Approve pending enrollment
router.post('/:enrollmentId/approve', auth, instructorAuth, [
  param('enrollmentId').isMongoId()
], async (req, res) => {
  try {
    const enrollment = await ClassEnrollment.findOne({
      _id: req.params.enrollmentId,
      status: 'pending'
    }).populate('classId');
    
    if (!enrollment) {
      return res.status(404).json({ error: 'Pending enrollment not found' });
    }
    
    const classDoc = enrollment.classId;
    if (classDoc.instructorId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    enrollment.status = 'enrolled';
    enrollment.enrolledBy = req.user.id;
    await enrollment.save();
    
    await classDoc.updateEnrollmentStats();
    
    res.json({
      success: true,
      enrollment,
      message: 'Enrollment approved'
    });
  } catch (error) {
    console.error('Error approving enrollment:', error);
    res.status(500).json({ error: 'Failed to approve enrollment' });
  }
});

// DELETE /api/enrollment/:enrollmentId - Remove student from class (instructor)
router.delete('/:enrollmentId', auth, instructorAuth, [
  param('enrollmentId').isMongoId()
], async (req, res) => {
  try {
    const enrollment = await ClassEnrollment.findById(req.params.enrollmentId)
      .populate('classId');
    
    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }
    
    const classDoc = enrollment.classId;
    if (classDoc.instructorId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // If student is already dropped or withdrawn, permanently delete the enrollment
    if (enrollment.status === 'dropped' || enrollment.status === 'withdrawn') {
      await enrollment.remove();
      await classDoc.updateEnrollmentStats();
      
      return res.json({
        success: true,
        message: 'Student permanently removed from class roster'
      });
    }
    
    // Otherwise, change status to withdrawn
    enrollment.status = 'withdrawn';
    enrollment.withdrawnAt = new Date();
    enrollment.withdrawnBy = req.user.id;
    enrollment.withdrawalReason = req.body.reason || 'Instructor removed';
    await enrollment.save();
    
    await classDoc.updateEnrollmentStats();
    
    res.json({
      success: true,
      message: 'Student removed from class'
    });
  } catch (error) {
    console.error('Error removing student:', error);
    res.status(500).json({ error: 'Failed to remove student' });
  }
});

// POST /api/enrollment/:enrollmentId/resend-invite - Resend invitation
router.post('/:enrollmentId/resend-invite', auth, instructorAuth, [
  param('enrollmentId').isMongoId()
], async (req, res) => {
  try {
    const enrollment = await ClassEnrollment.findOne({
      _id: req.params.enrollmentId,
      status: 'invited'
    }).populate('classId');
    
    if (!enrollment) {
      return res.status(404).json({ error: 'Invited enrollment not found' });
    }
    
    const classDoc = enrollment.classId;
    if (classDoc.instructorId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Find associated invitation
    const invitation = await ClassInvitation.findOne({
      classId: classDoc._id,
      email: enrollment.rosterData?.originalEmail,
      status: 'pending'
    });
    
    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }
    
    // Resend invitation
    const emailService = require('../services/emailService');

    const inviteUrl = `${process.env.STUDENT_PORTAL_URL || 'https://app.intellaclick.com'}/accept-invite?token=${invitation.token}`;

    await emailService.sendEmail(
      invitation.email,
      `Reminder: Invitation to join ${classDoc.name}`,
      `<p>This is a reminder to join the class ${classDoc.name}.</p>
       <p><a href="${inviteUrl}">Accept Invitation</a></p>`
    );
    
    invitation.lastSentAt = new Date();
    invitation.sentCount += 1;
    await invitation.save();
    
    res.json({
      success: true,
      message: 'Invitation resent successfully'
    });
  } catch (error) {
    console.error('Error resending invitation:', error);
    res.status(500).json({ error: 'Failed to resend invitation' });
  }
});

// GET /api/enrollment/class/:classId/students - Get class students with enrollment info
router.get('/class/:classId/students', auth, [
  param('classId').isMongoId()
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('[GET /enrollment/class/:classId/students] Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }
    
    console.log('[GET /enrollment/class/:classId/students] Request params:', {
      classId: req.params.classId,
      userId: req.user?.id || req.user?._id,
      queryStatus: req.query.status
    });
    
    const classDoc = await Class.findById(req.params.classId);
    
    if (!classDoc) {
      console.error('[GET /enrollment/class/:classId/students] Class not found:', req.params.classId);
      return res.status(404).json({ error: 'Class not found' });
    }
    
    // Check if user is instructor or enrolled student
    const userId = req.user._id || req.user.id || req.user.userId;
    
    // Ensure proper comparison - convert both to strings
    // Handle case where userId might already be a string
    const userIdStr = userId?.toString ? userId.toString() : String(userId);
    
    // Handle populated instructorId (object with _id) vs plain ID
    let instructorIdStr;
    if (typeof classDoc.instructorId === 'object' && classDoc.instructorId._id) {
        // Populated - extract the _id
        instructorIdStr = classDoc.instructorId._id.toString();
    } else {
        // Not populated - use directly
        instructorIdStr = classDoc.instructorId?.toString ? classDoc.instructorId.toString() : String(classDoc.instructorId);
    }
    
    const isInstructor = instructorIdStr === userIdStr;
    
    console.log('[GET /enrollment/class/:classId/students] Auth check:', {
      userId: userIdStr,
      instructorId: instructorIdStr,
      isInstructor: isInstructor,
      userRole: req.user.role,
      instructorIdType: typeof classDoc.instructorId
    });
    
    // If not instructor, check if they're an enrolled student
    if (!isInstructor) {
      const enrollment = await ClassEnrollment.findOne({
        classId: classDoc._id,
        studentId: userId,
        status: 'enrolled'
      });
      
      console.log('[GET /enrollment/class/:classId/students] Student access check:', {
        hasEnrollment: !!enrollment,
        userId: userId
      });
      
      if (!enrollment) {
        return res.status(403).json({ error: 'Access denied - you must be enrolled in this class or be the instructor' });
      }
    }
    
    // Get enrollments based on role
    const query = { classId: req.params.classId };
    if (!isInstructor) {
      // Students only see enrolled students
      query.status = 'enrolled';
    } else if (req.query.status) {
      // Instructors can filter by status
      query.status = req.query.status;
    }
    
    console.log('[GET /enrollment/class/:classId/students] Query:', query);
    
    const enrollments = await ClassEnrollment.find(query)
      .populate('studentId', 'email profile')
      .sort({ enrolledAt: -1 }); // Sort by enrollment date instead of name since we can't sort by populated fields
    
    console.log('[GET /enrollment/class/:classId/students] Found enrollments:', {
      count: enrollments.length,
      sample: enrollments.length > 0 ? {
        hasStudentId: !!enrollments[0].studentId,
        studentIdType: typeof enrollments[0].studentId
      } : null
    });
    
    // Filter out any enrollments where student data couldn't be populated
    const validEnrollments = enrollments.filter(enrollment => enrollment.studentId);
    
    const formattedEnrollments = validEnrollments.map(enrollment => {
      // Safely access student data with null checks
      const student = enrollment.studentId;
      return {
        _id: enrollment._id,
        status: enrollment.status,
        enrolledAt: enrollment.enrolledAt,
        stats: enrollment.stats,
        student: student ? {
          _id: student._id,
          email: student.email,
          firstName: student.profile?.firstName || '',
          lastName: student.profile?.lastName || ''
        } : null
      };
    })
    // Sort by name after population
    .sort((a, b) => {
      const lastNameCompare = (a.student?.lastName || '').localeCompare(b.student?.lastName || '');
      if (lastNameCompare !== 0) return lastNameCompare;
      return (a.student?.firstName || '').localeCompare(b.student?.firstName || '');
    });
    
    console.log('[GET /enrollment/class/:classId/students] Returning enrollments:', {
      count: formattedEnrollments.length,
      classId: req.params.classId
    });
    
    res.json({ enrollments: formattedEnrollments });
  } catch (error) {
    console.error('[GET /enrollment/class/:classId/students] Error:', {
      message: error.message,
      stack: error.stack,
      classId: req.params.classId
    });
    res.status(500).json({ error: 'Failed to fetch enrollments' });
  }
});

// Helper function to process roster upload
async function processRosterUpload(classDoc, records, instructorId) {
  const results = {
    summary: {
      total: records.length,
      matched: 0,
      enrolled: 0,
      invited: 0,
      errors: 0
    },
    matches: [],
    invitations: []
  };
  
  // Get existing students for fuzzy matching
  const existingStudents = await Student.find({}).select('email profile');
  const emailSet = fuzzy(existingStudents.map(s => s.email.toLowerCase()));
  
  for (const record of records) {
    try {
      // Extract data from CSV (handle various column names)
      const email = (
        record.email || 
        record.Email || 
        record['Student Email'] || 
        record['E-mail']
      )?.toLowerCase().trim();
      
      const firstName = 
        record.firstName || 
        record.FirstName || 
        record['First Name'] || 
        record.first_name || 
        '';
        
      const lastName = 
        record.lastName || 
        record.LastName || 
        record['Last Name'] || 
        record.last_name || 
        '';
        
      const studentId = 
        record.studentId || 
        record.StudentID || 
        record['Student ID'] || 
        record.id || 
        '';
      
      if (!email) {
        results.summary.errors++;
        continue;
      }
      
      // Try exact match first
      let student = existingStudents.find(s => s.email.toLowerCase() === email);
      
      if (student) {
        // Check if already enrolled
        const existingEnrollment = await ClassEnrollment.findOne({
          classId: classDoc._id,
          studentId: student._id
        });
        
        if (!existingEnrollment) {
          // Create enrollment
          await ClassEnrollment.create({
            classId: classDoc._id,
            studentId: student._id,
            enrollmentMethod: 'roster_upload',
            enrolledBy: instructorId,
            status: 'enrolled',
            rosterData: {
              originalName: `${firstName} ${lastName}`.trim(),
              originalEmail: email,
              studentId: studentId,
              matchMethod: 'exact_email'
            }
          });
          
          results.summary.enrolled++;
          results.summary.matched++;
        }
      } else {
        // Try fuzzy matching
        const fuzzyMatches = emailSet.get(email, [], 0.8);
        
        if (fuzzyMatches.length > 0) {
          // Found potential matches
          results.matches.push({
            rosterEntry: { email, firstName, lastName, studentId },
            potentialMatches: fuzzyMatches.map(match => {
              const matchedStudent = existingStudents.find(s => 
                s.email.toLowerCase() === match[1]
              );
              return {
                email: matchedStudent.email,
                name: `${matchedStudent.profile?.firstName} ${matchedStudent.profile?.lastName}`,
                confidence: match[0]
              };
            })
          });
          results.summary.matched++;
        } else {
          // No match found - create invitation
          const invitation = await ClassInvitation.create({
            classId: classDoc._id,
            createdBy: instructorId,
            email,
            rosterInfo: {
              firstName,
              lastName,
              studentId,
              fullName: `${firstName} ${lastName}`.trim()
            },
            source: 'csv_upload',
            uploadBatchId: req.body.batchId,
            token: require('crypto').randomBytes(32).toString('hex'),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          });
          
          results.invitations.push(invitation);
          results.summary.invited++;
        }
      }
    } catch (error) {
      console.error('Error processing roster record:', error);
      results.summary.errors++;
    }
  }
  
  // Update class stats
  await classDoc.updateEnrollmentStats();
  
  return results;
}

module.exports = router;
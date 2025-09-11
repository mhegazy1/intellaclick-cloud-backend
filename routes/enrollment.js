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
router.post('/join', auth, studentAuth, [
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

// POST /api/enrollment/drop-unified/:enrollmentId - Drop from class (unified auth)
router.post('/drop-unified/:enrollmentId', unifiedAuth, async (req, res) => {
  try {
    console.log('Drop class request:', {
      enrollmentId: req.params.enrollmentId,
      enrollmentIdLength: req.params.enrollmentId?.length,
      enrollmentIdType: typeof req.params.enrollmentId,
      user: req.user.email,
      isStudent: req.user.isStudent,
      headers: req.headers
    });
    
    const userId = req.user._id || req.user.id || req.user.userId;
    let studentId = userId;
    
    // If it's an instructor, find their linked student account
    if (!req.user.isStudent) {
      const linkedStudent = await Student.findOne({ email: req.user.email });
      if (linkedStudent) {
        studentId = linkedStudent._id;
      }
    }
    
    const enrollment = await ClassEnrollment.findOne({
      _id: req.params.enrollmentId,
      studentId: studentId
    }).populate('classId');
    
    console.log('Enrollment lookup result:', {
      enrollmentId: req.params.enrollmentId,
      studentId: studentId,
      found: !!enrollment,
      enrollment: enrollment ? { id: enrollment._id, status: enrollment.status } : null
    });
    
    if (!enrollment) {
      // Try to find any enrollment with this ID to debug
      const anyEnrollment = await ClassEnrollment.findById(req.params.enrollmentId);
      console.log('Debug - Any enrollment with this ID:', {
        found: !!anyEnrollment,
        enrollmentStudentId: anyEnrollment?.studentId,
        requestStudentId: studentId,
        match: anyEnrollment?.studentId?.toString() === studentId.toString()
      });
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
    const emailInstance = new emailService();
    
    const inviteUrl = `${process.env.STUDENT_PORTAL_URL || 'https://app.intellaclick.com'}/accept-invite?token=${invitation.token}`;
    
    await emailInstance.sendEmail(
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
    const classDoc = await Class.findById(req.params.classId);
    
    if (!classDoc) {
      return res.status(404).json({ error: 'Class not found' });
    }
    
    // Check if user is instructor or enrolled student
    const isInstructor = classDoc.instructorId.toString() === req.user.id;
    const isStudent = !isInstructor;
    
    if (isStudent) {
      const enrollment = await ClassEnrollment.findOne({
        classId: classDoc._id,
        studentId: req.user.id,
        status: 'enrolled'
      });
      
      if (!enrollment) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    // Get enrollments based on role
    const query = { classId: req.params.classId };
    if (isStudent) {
      // Students only see enrolled students
      query.status = 'enrolled';
    } else if (req.query.status) {
      // Instructors can filter by status
      query.status = req.query.status;
    }
    
    const enrollments = await ClassEnrollment.find(query)
      .populate('studentId', 'email profile')
      .sort({ 'studentId.profile.lastName': 1, 'studentId.profile.firstName': 1 });
    
    const formattedEnrollments = enrollments.map(enrollment => ({
      _id: enrollment._id,
      status: enrollment.status,
      enrolledAt: enrollment.enrolledAt,
      stats: enrollment.stats,
      student: {
        _id: enrollment.studentId._id,
        email: enrollment.studentId.email,
        firstName: enrollment.studentId.profile?.firstName,
        lastName: enrollment.studentId.profile?.lastName
      }
    }));
    
    res.json({ enrollments: formattedEnrollments });
  } catch (error) {
    console.error('Error fetching enrollments:', error);
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
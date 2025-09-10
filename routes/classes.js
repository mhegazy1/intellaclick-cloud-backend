const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const auth = require('../middleware/authWithRole'); // Enhanced auth that fetches role from DB
const instructorAuth = require('../middleware/instructorAuth');
const Class = require('../models/Class');
const ClassEnrollment = require('../models/ClassEnrollment');
const ClassInvitation = require('../models/ClassInvitation');
const Student = require('../models/Student');
const User = require('../models/User');

// Validation middleware
const classValidation = [
  body('name').notEmpty().trim().isLength({ max: 200 }),
  body('code').notEmpty().trim().isLength({ max: 50 }),
  body('section').optional().trim().isLength({ max: 20 }),
  body('term').notEmpty().trim().isLength({ max: 50 }),
  body('description').optional().trim().isLength({ max: 1000 }),
  body('startDate').isISO8601().toDate(),
  body('endDate').isISO8601().toDate().custom((endDate, { req }) => {
    if (new Date(endDate) <= new Date(req.body.startDate)) {
      throw new Error('End date must be after start date');
    }
    return true;
  }),
  body('enrollmentLimit').optional().isInt({ min: 1 }),
  body('enrollmentDeadline').optional().isISO8601().toDate()
];

// GET /api/classes - Get instructor's classes
router.get('/', auth, instructorAuth, async (req, res) => {
  try {
    const { status = 'active', term, includeArchived } = req.query;
    
    // Debug logging
    console.log('GET /api/classes - User object:', JSON.stringify({
      _id: req.user._id,
      id: req.user.id,
      userId: req.user.userId,
      role: req.user.role,
      email: req.user.email
    }));
    
    // Handle different user ID formats
    const userId = req.user._id || req.user.id || req.user.userId;
    console.log('Using userId:', userId);
    
    const query = {
      $or: [
        { instructorId: userId },
        { coInstructors: userId },
        { teachingAssistants: userId }
      ]
    };
    
    if (!includeArchived) {
      query.status = status;
    }
    
    if (term) {
      query.term = term;
    }
    
    console.log('Query:', JSON.stringify(query));
    
    const classes = await Class.find(query)
      .sort({ term: -1, code: 1, section: 1 })
      .populate('instructorId', 'firstName lastName email')
      .populate('coInstructors', 'firstName lastName email')
      .populate('teachingAssistants', 'firstName lastName email');
    
    console.log('Found classes:', classes.length);
    
    // Add enrollment counts
    const classesWithStats = await Promise.all(
      classes.map(async (classDoc) => {
        try {
          const enrollmentSummary = await ClassEnrollment.getClassSummary(classDoc._id);
          return {
            ...classDoc.toObject(),
            enrollmentSummary
          };
        } catch (summaryError) {
          console.error('Error getting enrollment summary for class:', classDoc._id, summaryError);
          // Return class without summary if it fails
          return {
            ...classDoc.toObject(),
            enrollmentSummary: { totalEnrolled: 0, activeStudents: 0 }
          };
        }
      })
    );
    
    res.json({ classes: classesWithStats });
  } catch (error) {
    console.error('Error fetching classes:', error);
    res.status(500).json({ error: 'Failed to fetch classes' });
  }
});

// GET /api/classes/stats - Get instructor statistics
router.get('/stats', auth, instructorAuth, async (req, res) => {
  try {
    const instructorId = req.user._id || req.user.id || req.user.userId;
    
    // Get all instructor's classes
    const classes = await Class.find({
      $or: [
        { instructorId },
        { coInstructors: instructorId },
        { teachingAssistants: instructorId }
      ]
    });
    
    const classIds = classes.map(c => c._id);
    
    // Get enrollment stats
    const enrollments = await ClassEnrollment.aggregate([
      { $match: { classId: { $in: classIds }, status: 'enrolled' } },
      { $group: { _id: null, total: { $sum: 1 } } }
    ]);
    
    // Get session stats for current term
    const currentTerm = classes
      .filter(c => c.status === 'active')
      .map(c => c.term)
      .sort()
      .pop();
    
    const currentTermClasses = classes.filter(c => c.term === currentTerm);
    const currentTermClassIds = currentTermClasses.map(c => c._id);
    
    // Count sessions (would need Session model)
    // For now, returning placeholder
    const sessionCount = 0;
    
    // Calculate average engagement
    const engagementStats = await ClassEnrollment.aggregate([
      { $match: { classId: { $in: classIds }, status: 'enrolled' } },
      { $group: {
          _id: null,
          avgAttendance: { $avg: '$stats.attendanceRate' },
          totalSessions: { $sum: '$stats.sessionsAttended' }
        }
      }
    ]);
    
    const avgEngagement = engagementStats[0]?.avgAttendance || 0;
    
    res.json({
      totalClasses: classes.filter(c => c.status === 'active').length,
      totalStudents: enrollments[0]?.total || 0,
      totalSessions: sessionCount,
      avgEngagement: Math.round(avgEngagement)
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// GET /api/classes/terms - Get unique terms
router.get('/terms', auth, instructorAuth, async (req, res) => {
  try {
    const terms = await Class.distinct('term', {
      $or: [
        { instructorId: (req.user._id || req.user.id || req.user.userId) },
        { coInstructors: (req.user._id || req.user.id || req.user.userId) },
        { teachingAssistants: (req.user._id || req.user.id || req.user.userId) }
      ]
    });
    
    res.json({ terms: terms.sort().reverse() });
  } catch (error) {
    console.error('Error fetching terms:', error);
    res.status(500).json({ error: 'Failed to fetch terms' });
  }
});

// POST /api/classes - Create new class
router.post('/', auth, instructorAuth, classValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const classData = {
      ...req.body,
      instructorId: (req.user._id || req.user.id || req.user.userId)
    };
    
    // Create class
    const newClass = new Class(classData);
    
    // Generate join code
    await newClass.generateJoinCode();
    
    await newClass.save();
    
    // Populate instructor info
    await newClass.populate('instructorId', 'firstName lastName email');
    
    res.status(201).json({ 
      success: true,
      class: newClass,
      message: `Class created with join code: ${newClass.joinCode}`
    });
  } catch (error) {
    console.error('Error creating class:', error);
    res.status(500).json({ error: 'Failed to create class' });
  }
});

// GET /api/classes/:id - Get class details
router.get('/:id', auth, param('id').isMongoId(), async (req, res) => {
  try {
    const classDoc = await Class.findById(req.params.id)
      .populate('instructorId', 'firstName lastName email')
      .populate('coInstructors', 'firstName lastName email')
      .populate('teachingAssistants', 'firstName lastName email');
    
    if (!classDoc) {
      return res.status(404).json({ error: 'Class not found' });
    }
    
    // Check access
    const hasAccess = 
      classDoc.instructorId._id.toString() === (req.user._id || req.user.id || req.user.userId) ||
      classDoc.coInstructors.some(co => co._id.toString() === (req.user._id || req.user.id || req.user.userId)) ||
      classDoc.teachingAssistants.some(ta => ta._id.toString() === (req.user._id || req.user.id || req.user.userId));
    
    if (!hasAccess && req.user.role !== 'admin') {
      // Check if student is enrolled
      const enrollment = await ClassEnrollment.findOne({
        classId: classDoc._id,
        studentId: (req.user._id || req.user.id || req.user.userId),
        status: 'enrolled'
      });
      
      if (!enrollment) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    // Get enrollment summary
    const enrollmentSummary = await ClassEnrollment.getClassSummary(classDoc._id);
    
    res.json({ 
      class: {
        ...classDoc.toObject(),
        enrollmentSummary
      }
    });
  } catch (error) {
    console.error('Error fetching class:', error);
    res.status(500).json({ error: 'Failed to fetch class' });
  }
});

// GET /api/classes/:id/details - Get class details with student's enrollment info
router.get('/:id/details', auth, param('id').isMongoId(), async (req, res) => {
  try {
    const classDoc = await Class.findById(req.params.id)
      .populate('instructorId', 'firstName lastName email');
    
    if (!classDoc) {
      return res.status(404).json({ error: 'Class not found' });
    }
    
    // Get student's enrollment
    const enrollment = await ClassEnrollment.findOne({
      classId: classDoc._id,
      studentId: (req.user._id || req.user.id || req.user.userId)
    });
    
    if (!enrollment || (enrollment.status !== 'enrolled' && enrollment.status !== 'pending')) {
      return res.status(403).json({ error: 'Not enrolled in this class' });
    }
    
    res.json({
      class: classDoc,
      enrollment: {
        enrollmentId: enrollment._id,
        status: enrollment.status,
        enrolledAt: enrollment.enrolledAt,
        lastActivity: enrollment.lastActivityAt,
        stats: enrollment.stats,
        academicInfo: enrollment.academicInfo
      }
    });
  } catch (error) {
    console.error('Error fetching class details:', error);
    res.status(500).json({ error: 'Failed to fetch class details' });
  }
});

// GET /api/classes/:id/sessions - Get class sessions with student participation
router.get('/:id/sessions', auth, param('id').isMongoId(), async (req, res) => {
  try {
    // Check enrollment
    const enrollment = await ClassEnrollment.findOne({
      classId: req.params.id,
      studentId: (req.user._id || req.user.id || req.user.userId),
      status: { $in: ['enrolled', 'pending'] }
    });
    
    if (!enrollment) {
      return res.status(403).json({ error: 'Not enrolled in this class' });
    }
    
    // TODO: Implement when Session model is created
    // For now, return empty array
    const sessions = [];
    
    res.json({ sessions });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// PUT /api/classes/:id - Update class
router.put('/:id', auth, instructorAuth, [
  param('id').isMongoId(),
  ...classValidation
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const classDoc = await Class.findById(req.params.id);
    
    if (!classDoc) {
      return res.status(404).json({ error: 'Class not found' });
    }
    
    // Check ownership
    if (classDoc.instructorId.toString() !== (req.user._id || req.user.id || req.user.userId) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Update fields
    Object.assign(classDoc, req.body);
    await classDoc.save();
    
    res.json({ 
      success: true,
      class: classDoc
    });
  } catch (error) {
    console.error('Error updating class:', error);
    res.status(500).json({ error: 'Failed to update class' });
  }
});

// POST /api/classes/:id/generate-join-code - Generate new join code
router.post('/:id/generate-join-code', auth, instructorAuth, [
  param('id').isMongoId(),
  body('expiryDays').optional().isInt({ min: 1, max: 365 }),
  body('usageLimit').optional().isInt({ min: 1 })
], async (req, res) => {
  try {
    const classDoc = await Class.findById(req.params.id);
    
    if (!classDoc) {
      return res.status(404).json({ error: 'Class not found' });
    }
    
    if (classDoc.instructorId.toString() !== (req.user._id || req.user.id || req.user.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Set expiry
    if (req.body.expiryDays) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + req.body.expiryDays);
      classDoc.joinCodeExpiry = expiry;
    }
    
    // Set usage limit
    if (req.body.usageLimit) {
      classDoc.joinCodeUsageLimit = req.body.usageLimit;
    }
    
    // Reset usage count
    classDoc.joinCodeUsageCount = 0;
    
    // Generate new code
    await classDoc.generateJoinCode();
    await classDoc.save();
    
    res.json({ 
      success: true,
      joinCode: classDoc.joinCode,
      expiresAt: classDoc.joinCodeExpiry,
      usageLimit: classDoc.joinCodeUsageLimit
    });
  } catch (error) {
    console.error('Error generating join code:', error);
    res.status(500).json({ error: 'Failed to generate join code' });
  }
});

// GET /api/classes/:id/students - Get enrolled students
router.get('/:id/students', auth, [
  param('id').isMongoId(),
  query('status').optional().isIn(['enrolled', 'dropped', 'withdrawn', 'pending', 'invited', 'all'])
], async (req, res) => {
  try {
    const classDoc = await Class.findById(req.params.id);
    
    if (!classDoc) {
      return res.status(404).json({ error: 'Class not found' });
    }
    
    // Check access
    const isInstructor = 
      classDoc.instructorId.toString() === (req.user._id || req.user.id || req.user.userId) ||
      classDoc.coInstructors.includes((req.user._id || req.user.id || req.user.userId)) ||
      classDoc.teachingAssistants.includes((req.user._id || req.user.id || req.user.userId));
    
    if (!isInstructor && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const enrollmentQuery = { classId: req.params.id };
    if (req.query.status && req.query.status !== 'all') {
      enrollmentQuery.status = req.query.status;
    }
    
    const enrollments = await ClassEnrollment.find(enrollmentQuery)
      .populate('studentId', 'email profile')
      .populate('enrolledBy', 'firstName lastName')
      .sort({ enrolledAt: -1 });
    
    // Format student data
    const students = enrollments.map(enrollment => ({
      enrollmentId: enrollment._id,
      studentId: enrollment.studentId._id,
      email: enrollment.studentId.email,
      firstName: enrollment.studentId.profile?.firstName,
      lastName: enrollment.studentId.profile?.lastName,
      status: enrollment.status,
      enrolledAt: enrollment.enrolledAt,
      enrollmentMethod: enrollment.enrollmentMethod,
      enrolledBy: enrollment.enrolledBy,
      lastActivity: enrollment.lastActivityAt,
      stats: enrollment.stats,
      academicInfo: enrollment.academicInfo,
      permissions: enrollment.permissions,
      rosterData: enrollment.rosterData
    }));
    
    res.json({ students });
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// GET /api/classes/:id/export-roster - Export class roster as CSV
router.get('/:id/export-roster', auth, instructorAuth, param('id').isMongoId(), async (req, res) => {
  try {
    const classDoc = await Class.findById(req.params.id);
    
    if (!classDoc) {
      return res.status(404).json({ error: 'Class not found' });
    }
    
    if (classDoc.instructorId.toString() !== (req.user._id || req.user.id || req.user.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get all enrolled students
    const enrollments = await ClassEnrollment.find({
      classId: req.params.id,
      status: 'enrolled'
    })
      .populate('studentId', 'email profile')
      .sort({ 'studentId.profile.lastName': 1, 'studentId.profile.firstName': 1 });
    
    // Create CSV content
    const csvRows = [];
    csvRows.push(['Last Name', 'First Name', 'Email', 'Student ID', 'Enrollment Date', 'Attendance %', 'Sessions', 'Questions', 'Correct']);
    
    for (const enrollment of enrollments) {
      const student = enrollment.studentId;
      const stats = enrollment.stats || {};
      
      csvRows.push([
        student.profile?.lastName || '',
        student.profile?.firstName || '',
        student.email,
        enrollment.rosterData?.studentId || '',
        enrollment.enrolledAt.toISOString().split('T')[0],
        stats.attendanceRate || '0',
        stats.sessionsAttended || '0',
        stats.questionsAnswered || '0',
        stats.correctAnswers || '0'
      ]);
    }
    
    // Convert to CSV string
    const csvContent = csvRows.map(row => 
      row.map(field => {
        // Escape quotes and wrap in quotes if contains comma
        const escaped = String(field).replace(/"/g, '""');
        return escaped.includes(',') ? `"${escaped}"` : escaped;
      }).join(',')
    ).join('\n');
    
    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${classDoc.code}_roster_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting roster:', error);
    res.status(500).json({ error: 'Failed to export roster' });
  }
});

// POST /api/classes/:id/students/add - Add single student
router.post('/:id/students/add', auth, instructorAuth, [
  param('id').isMongoId(),
  body('email').isEmail().normalizeEmail(),
  body('sendInvitation').optional().isBoolean()
], async (req, res) => {
  try {
    const { email, sendInvitation = true } = req.body;
    
    const classDoc = await Class.findById(req.params.id);
    if (!classDoc) {
      return res.status(404).json({ error: 'Class not found' });
    }
    
    if (classDoc.instructorId.toString() !== (req.user._id || req.user.id || req.user.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check if student exists
    let student = await Student.findOne({ email });
    
    if (student) {
      // Check if already enrolled
      const existingEnrollment = await ClassEnrollment.findOne({
        classId: classDoc._id,
        studentId: student._id
      });
      
      if (existingEnrollment && existingEnrollment.status === 'enrolled') {
        return res.status(400).json({ error: 'Student already enrolled' });
      }
      
      if (existingEnrollment) {
        // Re-enroll dropped student
        existingEnrollment.status = 'enrolled';
        existingEnrollment.enrolledAt = new Date();
        existingEnrollment.enrollmentMethod = 'instructor_added';
        existingEnrollment.enrolledBy = (req.user._id || req.user.id || req.user.userId);
        await existingEnrollment.save();
        
        await classDoc.updateEnrollmentStats();
        
        return res.json({ 
          success: true,
          enrollment: existingEnrollment,
          message: 'Student re-enrolled successfully'
        });
      }
      
      // Create new enrollment
      const enrollment = new ClassEnrollment({
        classId: classDoc._id,
        studentId: student._id,
        enrollmentMethod: 'instructor_added',
        enrolledBy: (req.user._id || req.user.id || req.user.userId),
        status: 'enrolled'
      });
      
      await enrollment.save();
      await classDoc.updateEnrollmentStats();
      
      res.json({ 
        success: true,
        enrollment,
        message: 'Student enrolled successfully'
      });
    } else {
      // Student doesn't exist - create invitation
      const invitation = new ClassInvitation({
        classId: classDoc._id,
        createdBy: (req.user._id || req.user.id || req.user.userId),
        email,
        source: 'manual'
      });
      
      invitation.generateToken();
      await invitation.save();
      
      if (sendInvitation) {
        // TODO: Send invitation email when email service is configured
        await invitation.markAsSent();
      }
      
      res.json({ 
        success: true,
        invitation,
        message: 'Student not found. Invitation created.'
      });
    }
  } catch (error) {
    console.error('Error adding student:', error);
    res.status(500).json({ error: 'Failed to add student' });
  }
});

// DELETE /api/classes/:id/students/:enrollmentId - Remove student
router.delete('/:id/students/:enrollmentId', auth, instructorAuth, [
  param('id').isMongoId(),
  param('enrollmentId').isMongoId(),
  body('reason').optional().trim()
], async (req, res) => {
  try {
    const enrollment = await ClassEnrollment.findOne({
      _id: req.params.enrollmentId,
      classId: req.params.id
    });
    
    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }
    
    const classDoc = await Class.findById(req.params.id);
    if (classDoc.instructorId.toString() !== (req.user._id || req.user.id || req.user.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await enrollment.withdraw((req.user._id || req.user.id || req.user.userId), req.body.reason || 'Instructor removed');
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

// POST /api/classes/:id/archive - Archive class
router.post('/:id/archive', auth, instructorAuth, param('id').isMongoId(), async (req, res) => {
  try {
    const classDoc = await Class.findById(req.params.id);
    
    if (!classDoc) {
      return res.status(404).json({ error: 'Class not found' });
    }
    
    if (classDoc.instructorId.toString() !== (req.user._id || req.user.id || req.user.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    classDoc.status = 'archived';
    classDoc.archivedAt = new Date();
    await classDoc.save();
    
    res.json({ 
      success: true,
      message: 'Class archived successfully'
    });
  } catch (error) {
    console.error('Error archiving class:', error);
    res.status(500).json({ error: 'Failed to archive class' });
  }
});

// POST /api/classes/:id/invite - Send invitations to multiple students
router.post('/:id/invite', auth, instructorAuth, [
  param('id').isMongoId(),
  body('emails').isArray().withMessage('Emails must be an array'),
  body('emails.*').isEmail().normalizeEmail(),
  body('customMessage').optional().trim().isLength({ max: 1000 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { emails, customMessage } = req.body;
    const classDoc = await Class.findById(req.params.id)
      .populate('instructorId', 'firstName lastName email');
    
    if (!classDoc) {
      return res.status(404).json({ error: 'Class not found' });
    }
    
    if (classDoc.instructorId._id.toString() !== (req.user._id || req.user.id || req.user.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const results = {
      sent: 0,
      alreadyEnrolled: 0,
      alreadyInvited: 0,
      failed: 0,
      details: []
    };
    
    // Process each email
    for (const email of emails) {
      try {
        // Check if student exists and is already enrolled
        const student = await Student.findOne({ email });
        
        if (student) {
          const enrollment = await ClassEnrollment.findOne({
            classId: classDoc._id,
            studentId: student._id,
            status: 'enrolled'
          });
          
          if (enrollment) {
            results.alreadyEnrolled++;
            results.details.push({ email, status: 'already_enrolled' });
            continue;
          }
        }
        
        // Check for existing invitation
        const existingInvitation = await ClassInvitation.findOne({
          classId: classDoc._id,
          email,
          status: 'pending'
        });
        
        if (existingInvitation) {
          results.alreadyInvited++;
          results.details.push({ email, status: 'already_invited' });
          continue;
        }
        
        // Create new invitation
        const invitation = new ClassInvitation({
          classId: classDoc._id,
          createdBy: (req.user._id || req.user.id || req.user.userId),
          email,
          source: 'instructor',
          customMessage
        });
        
        invitation.generateToken();
        await invitation.save();
        
        // Send invitation email if email service is configured
        const emailService = require('../services/emailService');
        const emailInstance = new emailService();
        
        const inviteUrl = `${process.env.STUDENT_PORTAL_URL || 'https://app.intellaclick.com'}/accept-invite?token=${invitation.token}`;
        
        const emailHtml = `
          <h2>You've been invited to join ${classDoc.name}</h2>
          <p>Hello,</p>
          <p>Professor ${classDoc.instructorId.firstName} ${classDoc.instructorId.lastName} has invited you to join their class:</p>
          <ul>
            <li><strong>Class:</strong> ${classDoc.name}</li>
            <li><strong>Code:</strong> ${classDoc.code}${classDoc.section ? ' - Section ' + classDoc.section : ''}</li>
            <li><strong>Term:</strong> ${classDoc.term}</li>
          </ul>
          ${customMessage ? `<p><strong>Message from instructor:</strong><br>${customMessage}</p>` : ''}
          <p>To accept this invitation, click the link below:</p>
          <p><a href="${inviteUrl}" style="display: inline-block; padding: 10px 20px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 5px;">Accept Invitation</a></p>
          <p>Or copy this link: ${inviteUrl}</p>
          <p>This invitation will expire in 30 days.</p>
          <p>If you already have an IntellaClick account, you can also join using the join code: <strong>${classDoc.joinCode}</strong></p>
        `;
        
        await emailInstance.sendEmail(
          email,
          `Invitation to join ${classDoc.name}`,
          emailHtml
        );
        
        await invitation.markAsSent();
        results.sent++;
        results.details.push({ email, status: 'sent' });
      } catch (error) {
        console.error(`Failed to send invitation to ${email}:`, error);
        results.failed++;
        results.details.push({ email, status: 'failed', error: error.message });
      }
    }
    
    res.json({
      success: true,
      summary: results,
      message: `Sent ${results.sent} invitation(s)`
    });
  } catch (error) {
    console.error('Error sending invitations:', error);
    res.status(500).json({ error: 'Failed to send invitations' });
  }
});

// GET /api/classes/:id/invitations - Get class invitations
router.get('/:id/invitations', auth, instructorAuth, [
  param('id').isMongoId(),
  query('status').optional().isIn(['pending', 'accepted', 'expired'])
], async (req, res) => {
  try {
    const classDoc = await Class.findById(req.params.id);
    
    if (!classDoc) {
      return res.status(404).json({ error: 'Class not found' });
    }
    
    if (classDoc.instructorId.toString() !== (req.user._id || req.user.id || req.user.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const query = { classId: req.params.id };
    if (req.query.status) {
      query.status = req.query.status;
    }
    
    const invitations = await ClassInvitation.find(query)
      .populate('createdBy', 'firstName lastName')
      .populate('acceptedBy', 'email profile')
      .sort({ createdAt: -1 });
    
    res.json({ invitations });
  } catch (error) {
    console.error('Error fetching invitations:', error);
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
});

// POST /api/classes/:id/invitations/:invitationId/resend - Resend invitation
router.post('/:id/invitations/:invitationId/resend', auth, instructorAuth, [
  param('id').isMongoId(),
  param('invitationId').isMongoId()
], async (req, res) => {
  try {
    const invitation = await ClassInvitation.findOne({
      _id: req.params.invitationId,
      classId: req.params.id,
      status: 'pending'
    });
    
    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }
    
    const classDoc = await Class.findById(req.params.id)
      .populate('instructorId', 'firstName lastName email');
    
    if (classDoc.instructorId._id.toString() !== (req.user._id || req.user.id || req.user.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Generate new token
    invitation.generateToken();
    invitation.lastSentAt = new Date();
    invitation.sentCount += 1;
    await invitation.save();
    
    // Resend email
    const emailService = require('../services/emailService');
    const emailInstance = new emailService();
    
    const inviteUrl = `${process.env.STUDENT_PORTAL_URL || 'https://app.intellaclick.com'}/accept-invite?token=${invitation.token}`;
    
    const emailHtml = `
      <h2>Reminder: You've been invited to join ${classDoc.name}</h2>
      <p>Hello,</p>
      <p>This is a reminder that Professor ${classDoc.instructorId.firstName} ${classDoc.instructorId.lastName} has invited you to join their class:</p>
      <ul>
        <li><strong>Class:</strong> ${classDoc.name}</li>
        <li><strong>Code:</strong> ${classDoc.code}${classDoc.section ? ' - Section ' + classDoc.section : ''}</li>
        <li><strong>Term:</strong> ${classDoc.term}</li>
      </ul>
      <p>To accept this invitation, click the link below:</p>
      <p><a href="${inviteUrl}" style="display: inline-block; padding: 10px 20px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 5px;">Accept Invitation</a></p>
      <p>Or copy this link: ${inviteUrl}</p>
      <p>This invitation will expire in 30 days from the original send date.</p>
    `;
    
    await emailInstance.sendEmail(
      invitation.email,
      `Reminder: Invitation to join ${classDoc.name}`,
      emailHtml
    );
    
    res.json({
      success: true,
      message: 'Invitation resent successfully'
    });
  } catch (error) {
    console.error('Error resending invitation:', error);
    res.status(500).json({ error: 'Failed to resend invitation' });
  }
});

// POST /api/classes/:id/upload-roster - Upload CSV roster
const multer = require('multer');
const csv = require('csv-parse');
const fuzzy = require('fuzzyset.js');

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

router.post('/:id/upload-roster', auth, instructorAuth, [
  param('id').isMongoId()
], upload.single('roster'), async (req, res) => {
  try {
    const classDoc = await Class.findById(req.params.id);
    
    if (!classDoc) {
      return res.status(404).json({ error: 'Class not found' });
    }
    
    if (classDoc.instructorId.toString() !== (req.user._id || req.user.id || req.user.userId)) {
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
    
    await new Promise((resolve, reject) => {
      parser.on('error', reject);
      parser.on('end', resolve);
      parser.write(req.file.buffer);
      parser.end();
    });
    
    // Process roster
    const results = {
      totalRows: records.length,
      matchedStudents: 0,
      newStudents: 0,
      duplicates: 0,
      errors: [],
      uploadId: require('crypto').randomBytes(16).toString('hex')
    };
    
    // Get existing students for matching
    const existingStudents = await Student.find({}).select('email profile');
    const emailMap = new Map(existingStudents.map(s => [s.email.toLowerCase(), s]));
    
    // Store processed data for confirmation
    const processedData = [];
    
    for (const record of records) {
      try {
        const email = (record.email || record.Email || record['Student Email'])?.toLowerCase().trim();
        const firstName = record.firstName || record.FirstName || record['First Name'] || '';
        const lastName = record.lastName || record.LastName || record['Last Name'] || '';
        const studentId = record.studentId || record.StudentID || record['Student ID'] || '';
        
        if (!email) {
          results.errors.push('Row missing email address');
          continue;
        }
        
        // Check if already enrolled
        const existingEnrollment = await ClassEnrollment.findOne({
          classId: classDoc._id,
          'rosterData.originalEmail': email
        });
        
        if (existingEnrollment) {
          results.duplicates++;
          continue;
        }
        
        const student = emailMap.get(email);
        
        processedData.push({
          email,
          firstName,
          lastName,
          studentId,
          matched: !!student,
          studentObjectId: student?._id
        });
        
        if (student) {
          results.matchedStudents++;
        } else {
          results.newStudents++;
        }
      } catch (error) {
        results.errors.push(`Error processing row: ${error.message}`);
      }
    }
    
    // Store upload data temporarily (could use Redis or memory cache)
    global.rosterUploads = global.rosterUploads || {};
    global.rosterUploads[results.uploadId] = {
      classId: classDoc._id,
      instructorId: (req.user._id || req.user.id || req.user.userId),
      data: processedData,
      timestamp: new Date()
    };
    
    // Clean old uploads after 1 hour
    setTimeout(() => {
      delete global.rosterUploads[results.uploadId];
    }, 60 * 60 * 1000);
    
    res.json(results);
  } catch (error) {
    console.error('Error uploading roster:', error);
    res.status(500).json({ error: 'Failed to upload roster' });
  }
});

// POST /api/classes/:id/confirm-roster - Confirm roster upload
router.post('/:id/confirm-roster', auth, instructorAuth, [
  param('id').isMongoId(),
  body('uploadId').notEmpty()
], async (req, res) => {
  try {
    const { uploadId } = req.body;
    const uploadData = global.rosterUploads?.[uploadId];
    
    if (!uploadData) {
      return res.status(400).json({ error: 'Upload data not found or expired' });
    }
    
    if (uploadData.classId.toString() !== req.params.id) {
      return res.status(400).json({ error: 'Upload data does not match class' });
    }
    
    if (uploadData.instructorId !== (req.user._id || req.user.id || req.user.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const classDoc = await Class.findById(req.params.id);
    const results = {
      enrolled: 0,
      invited: 0,
      errors: 0
    };
    
    for (const data of uploadData.data) {
      try {
        if (data.matched && data.studentObjectId) {
          // Enroll existing student
          await ClassEnrollment.create({
            classId: classDoc._id,
            studentId: data.studentObjectId,
            enrollmentMethod: 'roster_upload',
            enrolledBy: (req.user._id || req.user.id || req.user.userId),
            status: 'enrolled',
            rosterData: {
              originalEmail: data.email,
              originalName: `${data.firstName} ${data.lastName}`.trim(),
              studentId: data.studentId
            }
          });
          results.enrolled++;
        } else {
          // Create invitation for new student
          const invitation = new ClassInvitation({
            classId: classDoc._id,
            createdBy: (req.user._id || req.user.id || req.user.userId),
            email: data.email,
            source: 'roster_upload',
            rosterInfo: {
              firstName: data.firstName,
              lastName: data.lastName,
              studentId: data.studentId
            }
          });
          
          invitation.generateToken();
          await invitation.save();
          results.invited++;
          
          // Create pending enrollment record
          await ClassEnrollment.create({
            classId: classDoc._id,
            enrollmentMethod: 'roster_upload',
            enrolledBy: (req.user._id || req.user.id || req.user.userId),
            status: 'invited',
            rosterData: {
              originalEmail: data.email,
              originalName: `${data.firstName} ${data.lastName}`.trim(),
              studentId: data.studentId
            }
          });
        }
      } catch (error) {
        console.error('Error processing student:', error);
        results.errors++;
      }
    }
    
    // Update class stats
    await classDoc.updateEnrollmentStats();
    
    // Clean up upload data
    delete global.rosterUploads[uploadId];
    
    res.json({
      success: true,
      results,
      message: `Enrolled ${results.enrolled} students and sent ${results.invited} invitations`
    });
  } catch (error) {
    console.error('Error confirming roster:', error);
    res.status(500).json({ error: 'Failed to confirm roster' });
  }
});

module.exports = router;
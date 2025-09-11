const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const authWithRole = require('../middleware/authWithRole');
const Class = require('../models/Class');
const ClassEnrollment = require('../models/ClassEnrollment');
const Student = require('../models/Student');
const User = require('../models/User');

// POST /api/unified-enrollment/join - Join class with join code (works for both students and instructors testing)
router.post('/join', authWithRole, [
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
      console.log('Join code validation failed:', {
        hasJoinCode: !!classDoc.joinCode,
        joinCodeExpiry: classDoc.joinCodeExpiry,
        isExpired: classDoc.joinCodeExpiry && new Date() > classDoc.joinCodeExpiry,
        usageLimit: classDoc.joinCodeUsageLimit,
        usageCount: classDoc.joinCodeUsageCount,
        status: classDoc.status
      });
      return res.status(400).json({ error: 'Join code has expired or reached usage limit' });
    }
    
    // Check if enrollment is open
    if (!classDoc.isEnrollmentOpen()) {
      console.log('Enrollment check failed:', {
        allowSelfEnrollment: classDoc.allowSelfEnrollment,
        enrollmentDeadline: classDoc.enrollmentDeadline,
        isDeadlinePassed: classDoc.enrollmentDeadline && new Date() > classDoc.enrollmentDeadline,
        enrollmentLimit: classDoc.enrollmentLimit,
        enrolledCount: classDoc.stats?.enrolledCount,
        status: classDoc.status
      });
      return res.status(400).json({ error: 'Enrollment is closed for this class' });
    }
    
    // Get user ID (works for both students and instructors)
    const userId = req.user._id || req.user.id || req.user.userId;
    let studentId = userId;
    let studentData;
    
    // If it's an instructor account, we need to create a corresponding student record
    if (req.user.role) { // This is a User (instructor) account
      // Check if this instructor already has a student account
      const existingStudent = await Student.findOne({ email: req.user.email });
      
      if (existingStudent) {
        studentId = existingStudent._id;
        studentData = existingStudent;
      } else {
        // Create a student account for the instructor
        const newStudent = new Student({
          email: req.user.email,
          password: 'temp-' + Date.now(), // Won't be used for login
          profile: {
            firstName: req.user.firstName,
            lastName: req.user.lastName,
            institution: 'IntellaQuiz Instructor Account'
          },
          isVerified: true,
          metadata: {
            createdFrom: 'instructor-testing',
            linkedUserId: userId
          }
        });
        
        await newStudent.save();
        studentId = newStudent._id;
        studentData = newStudent;
      }
    } else {
      // This is already a student account
      studentData = await Student.findById(userId);
      if (!studentData) {
        return res.status(404).json({ error: 'Student account not found' });
      }
    }
    
    // Check if already enrolled
    const existingEnrollment = await ClassEnrollment.findOne({
      classId: classDoc._id,
      studentId: studentId
    });
    
    if (existingEnrollment) {
      if (existingEnrollment.status === 'enrolled') {
        return res.status(400).json({ 
          error: 'You are already enrolled in this class',
          enrollment: existingEnrollment
        });
      }
      
      // Re-activate dropped/withdrawn enrollment
      existingEnrollment.status = 'enrolled';
      existingEnrollment.enrolledAt = new Date();
      existingEnrollment.enrollmentMethod = 'join_code';
      await existingEnrollment.save();
      
      res.json({
        success: true,
        message: 'Re-enrolled in class successfully',
        enrollment: existingEnrollment,
        class: classDoc
      });
    } else {
      // Create new enrollment
      const enrollment = new ClassEnrollment({
        classId: classDoc._id,
        studentId: studentId,
        enrollmentMethod: 'join_code',
        status: classDoc.requireApproval ? 'pending' : 'enrolled',
        enrolledAt: new Date()
      });
      
      await enrollment.save();
      
      // Increment join code usage
      await classDoc.incrementJoinCodeUsage();
      
      res.status(201).json({
        success: true,
        message: classDoc.requireApproval 
          ? 'Enrollment pending instructor approval' 
          : 'Enrolled in class successfully',
        enrollment: enrollment,
        class: classDoc,
        requiresApproval: classDoc.requireApproval
      });
    }
  } catch (error) {
    console.error('Error joining class:', error);
    res.status(500).json({ error: 'Failed to join class' });
  }
});

module.exports = router;
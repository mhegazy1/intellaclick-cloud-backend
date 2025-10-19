const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const Student = require('../models/Student');
const auth = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');
const emailService = require('../services/emailService');

// Rate limiting for auth endpoints
// Generous limits that allow normal use while preventing abuse
const authLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 attempts per 15 min - blocks brute force, allows normal use
  message: 'Too many authentication attempts, please try again later',
  skipSuccessfulRequests: true // Don't count successful requests
});

// Generate JWT token
const generateToken = (studentId) => {
  return jwt.sign(
    { userId: studentId, type: 'student' },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '7d' }
  );
};

// Generate refresh token
const generateRefreshToken = (studentId) => {
  return jwt.sign(
    { userId: studentId, type: 'refresh', userType: 'student' },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '30d' }
  );
};

// Validation middleware
const registrationValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .custom(async (email) => {
      const existingStudent = await Student.findOne({ email });
      if (existingStudent) {
        throw new Error('Email already registered');
      }
      return true;
    }),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  body('firstName')
    .notEmpty()
    .trim()
    .isLength({ max: 50 })
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('First name can only contain letters, spaces, hyphens, and apostrophes'),
  body('lastName')
    .notEmpty()
    .trim()
    .isLength({ max: 50 })
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('Last name can only contain letters, spaces, hyphens, and apostrophes'),
  body('studentId')
    .optional({ checkFalsy: true })
    .trim()
    .isAlphanumeric()
    .withMessage('Student ID can only contain letters and numbers'),
  body('institution')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 200 }),
  body('termsAccepted')
    .isBoolean()
    .equals('true')
    .withMessage('You must accept the terms and conditions'),
  body('privacyAccepted')
    .isBoolean()
    .equals('true')
    .withMessage('You must accept the privacy policy')
];

// POST /api/students/register
router.post('/register', authLimiter, registrationValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array() 
      });
    }

    const {
      email,
      password,
      firstName,
      lastName,
      studentId,
      institution,
      termsAccepted,
      privacyAccepted,
      marketingOptIn = false
    } = req.body;

    // Create student
    const student = new Student({
      email,
      password,
      profile: {
        firstName,
        lastName,
        studentId,
        institution
      },
      consent: {
        termsAccepted,
        termsAcceptedAt: new Date(),
        privacyAccepted,
        privacyAcceptedAt: new Date(),
        marketingOptIn
      }
    });

    // Generate verification token
    const verificationToken = student.generateVerificationToken();

    // Save student
    await student.save();

    // Send verification email (async, don't await)
    if (emailService) {
      emailService.sendVerificationEmail(email, verificationToken, {
        firstName,
        studentId: student._id,
        isInstructor: false
      }).catch(err => {
        console.error('Failed to send verification email:', err);
      });
    }

    // Generate tokens
    const token = generateToken(student._id.toString());
    const refreshToken = generateRefreshToken(student._id.toString());

    // Update login metadata
    student.updateLoginMetadata(req.ip);
    await student.save();

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please check your email to verify your account.',
      token,
      refreshToken,
      student: student.toJSON()
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Registration failed',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred during registration'
    });
  }
});

// POST /api/students/login
router.post('/login', authLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array() 
      });
    }

    const { email, password } = req.body;

    // Find student
    const student = await Student.findOne({ 
      email,
      'metadata.accountStatus': 'active'
    });

    if (!student) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid credentials' 
      });
    }

    // Check password
    const isMatch = await student.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid credentials' 
      });
    }

    // Check if account is suspended
    if (student.metadata.accountStatus === 'suspended') {
      return res.status(403).json({ 
        success: false,
        error: 'Account suspended',
        reason: student.metadata.suspensionReason
      });
    }

    // Generate tokens
    const token = generateToken(student._id.toString());
    const refreshToken = generateRefreshToken(student._id.toString());

    // Update login metadata
    student.updateLoginMetadata(req.ip);
    await student.save();

    res.json({
      success: true,
      token,
      refreshToken,
      student: student.toJSON(),
      emailVerified: student.verification.emailVerified
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Login failed',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred during login'
    });
  }
});

// POST /api/students/verify-email
router.post('/verify-email', [
  body('token').notEmpty().withMessage('Verification token is required')
], async (req, res) => {
  try {
    const { token } = req.body;

    // Hash the token to match stored version
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find student with valid token
    const student = await Student.findOne({
      'verification.verificationToken': hashedToken,
      'verification.verificationExpires': { $gt: Date.now() }
    });

    if (!student) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired verification token'
      });
    }

    // Verify email
    student.verifyEmail();
    await student.save();

    res.json({
      success: true,
      message: 'Email verified successfully'
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Email verification failed'
    });
  }
});

// POST /api/students/resend-verification
router.post('/resend-verification', authLimiter, [
  body('email').isEmail().normalizeEmail()
], async (req, res) => {
  try {
    const { email } = req.body;

    const student = await Student.findOne({ email });
    if (!student) {
      // Don't reveal if email exists
      return res.json({
        success: true,
        message: 'If the email exists, a verification link has been sent'
      });
    }

    if (student.verification.emailVerified) {
      return res.status(400).json({
        success: false,
        error: 'Email already verified'
      });
    }

    // Generate new verification token
    const verificationToken = student.generateVerificationToken();
    await student.save();

    // Send verification email
    if (emailService) {
      await emailService.sendVerificationEmail(email, verificationToken, {
        firstName: student.profile.firstName,
        studentId: student._id,
        isInstructor: false
      });
    }

    res.json({
      success: true,
      message: 'Verification email sent'
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resend verification email'
    });
  }
});

// POST /api/students/forgot-password
router.post('/forgot-password', authLimiter, [
  body('email').isEmail().normalizeEmail()
], async (req, res) => {
  try {
    const { email } = req.body;

    const student = await Student.findOne({ email });
    if (!student) {
      // Don't reveal if email exists
      return res.json({
        success: true,
        message: 'If the email exists, a password reset link has been sent'
      });
    }

    // Generate reset token
    const resetToken = student.generatePasswordResetToken();
    await student.save();

    // Send reset email
    if (emailService) {
      await emailService.sendPasswordResetEmail(email, resetToken, {
        firstName: student.profile.firstName,
        isInstructor: false
      });
    }

    res.json({
      success: true,
      message: 'Password reset email sent'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process password reset request'
    });
  }
});

// POST /api/students/reset-password
router.post('/reset-password', [
  body('token').notEmpty(),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array() 
      });
    }

    const { token, password } = req.body;

    // Hash the token to match stored version
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find student with valid token
    const student = await Student.findOne({
      'passwordReset.resetToken': hashedToken,
      'passwordReset.resetExpires': { $gt: Date.now() }
    });

    if (!student) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset token'
      });
    }

    // Update password
    student.password = password;
    student.passwordReset.resetToken = undefined;
    student.passwordReset.resetExpires = undefined;
    await student.save();

    // Send confirmation email
    if (emailService) {
      emailService.sendPasswordChangeConfirmation(student.email, {
        firstName: student.profile.firstName
      }).catch(err => {
        console.error('Failed to send password change confirmation:', err);
      });
    }

    res.json({
      success: true,
      message: 'Password reset successful'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset password'
    });
  }
});

// GET /api/students/me - Get current student
router.get('/me', auth, async (req, res) => {
  try {
    // Auth middleware should verify this is a student
    if (req.user.type !== 'student') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const student = await Student.findById(req.user.userId);
    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }

    res.json({
      success: true,
      student: student.toJSON()
    });
  } catch (error) {
    console.error('Get student error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get student data'
    });
  }
});

// PUT /api/students/profile - Update profile
router.put('/profile', auth, [
  body('firstName').optional().trim().isLength({ max: 50 }),
  body('lastName').optional().trim().isLength({ max: 50 }),
  body('preferredName').optional().trim().isLength({ max: 50 }),
  body('studentId').optional().trim().isAlphanumeric(),
  body('institution').optional().trim().isLength({ max: 200 })
], async (req, res) => {
  try {
    if (req.user.type !== 'student') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array() 
      });
    }

    const student = await Student.findById(req.user.userId);
    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }

    // Update allowed fields
    const allowedFields = ['firstName', 'lastName', 'preferredName', 'studentId', 'institution'];
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        student.profile[field] = req.body[field];
      }
    });

    await student.save();

    res.json({
      success: true,
      student: student.toJSON()
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    });
  }
});

// PUT /api/students/settings - Update settings
router.put('/settings', auth, async (req, res) => {
  try {
    if (req.user.type !== 'student') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const student = await Student.findById(req.user.userId);
    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }

    // Deep merge settings
    if (req.body.notifications) {
      Object.assign(student.settings.notifications, req.body.notifications);
    }
    if (req.body.privacy) {
      Object.assign(student.settings.privacy, req.body.privacy);
    }
    if (req.body.accessibility) {
      Object.assign(student.settings.accessibility, req.body.accessibility);
    }

    await student.save();

    res.json({
      success: true,
      settings: student.settings
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update settings'
    });
  }
});

// POST /api/students/refresh - Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({ 
        success: false,
        error: 'Refresh token required' 
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET || 'dev-secret');
    
    if (decoded.type !== 'refresh' || decoded.userType !== 'student') {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid token type' 
      });
    }

    // Check if student still exists and is active
    const student = await Student.findOne({
      _id: decoded.userId,
      'metadata.accountStatus': 'active'
    });

    if (!student) {
      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token'
      });
    }

    // Generate new tokens
    const token = generateToken(decoded.userId);
    const newRefreshToken = generateRefreshToken(decoded.userId);

    res.json({
      success: true,
      token,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({ 
      success: false,
      error: 'Invalid refresh token' 
    });
  }
});

// DELETE /api/students/account - Soft delete account (GDPR compliance)
router.delete('/account', auth, [
  body('password').notEmpty().withMessage('Password required for account deletion')
], async (req, res) => {
  try {
    if (req.user.type !== 'student') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const { password } = req.body;

    const student = await Student.findById(req.user.userId);
    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }

    // Verify password
    const isMatch = await student.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid password'
      });
    }

    // Soft delete
    await student.softDelete();

    res.json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete account'
    });
  }
});

// GET /api/students/export - Export student data (GDPR compliance)
router.get('/export', auth, async (req, res) => {
  try {
    if (req.user.type !== 'student') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const student = await Student.findById(req.user.userId);
    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }

    const exportData = student.exportData();

    res.json({
      success: true,
      data: exportData,
      exportedAt: new Date()
    });
  } catch (error) {
    console.error('Export data error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export data'
    });
  }
});

// Admin route to clean up unverified accounts (should be in a separate admin router in production)
router.delete('/cleanup-unverified', async (req, res) => {
  try {
    // This should be protected by admin authentication in production
    const result = await Student.cleanupUnverified();
    
    res.json({
      success: true,
      message: `Cleaned up ${result.deletedCount} unverified accounts`
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup unverified accounts'
    });
  }
});

module.exports = router;
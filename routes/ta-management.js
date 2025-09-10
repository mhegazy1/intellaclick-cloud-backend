const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const instructorAuth = require('../middleware/instructorAuth');
const checkTAPermission = require('../middleware/checkTAPermission');
const TAPermissions = require('../models/TAPermissions');
const Class = require('../models/Class');
const User = require('../models/User');
const { body, param, validationResult } = require('express-validator');

/**
 * Get all TAs for a class (instructor only)
 */
router.get('/class/:classId/tas', auth, async (req, res) => {
  try {
    const { classId } = req.params;
    const userId = req.user._id || req.user.userId;
    
    // Verify instructor owns the class
    const classDoc = await Class.findById(classId);
    if (!classDoc) {
      return res.status(404).json({
        success: false,
        error: 'Class not found'
      });
    }
    
    if (classDoc.instructorId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Only the class instructor can manage TAs'
      });
    }
    
    // Get all TA permissions for this class
    const taPermissions = await TAPermissions.find({ classId })
      .populate('taUserId', 'firstName lastName email')
      .populate('grantedBy', 'firstName lastName')
      .sort('-createdAt');
    
    res.json({
      success: true,
      tas: taPermissions.map(ta => ({
        id: ta._id,
        taUser: {
          id: ta.taUserId._id,
          name: `${ta.taUserId.firstName} ${ta.taUserId.lastName}`,
          email: ta.taUserId.email
        },
        permissions: {
          session: ta.sessionPermissions,
          question: ta.questionPermissions,
          student: ta.studentPermissions,
          analytics: ta.analyticsPermissions,
          content: ta.contentPermissions,
          admin: ta.adminPermissions
        },
        timeRestrictions: ta.timeRestrictions,
        isActive: ta.isActive,
        grantedBy: ta.grantedBy ? `${ta.grantedBy.firstName} ${ta.grantedBy.lastName}` : 'Unknown',
        createdAt: ta.createdAt,
        lastAccessedAt: ta.lastAccessedAt
      }))
    });
    
  } catch (error) {
    console.error('Error fetching TAs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch teaching assistants'
    });
  }
});

/**
 * Add a TA to a class (instructor only)
 */
router.post('/class/:classId/tas', auth, [
  param('classId').isMongoId(),
  body('taEmail').isEmail().normalizeEmail(),
  body('permissions').isObject(),
  body('timeRestrictions').optional().isObject(),
  body('notes').optional().isString().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }
    
    const { classId } = req.params;
    const { taEmail, permissions, timeRestrictions, notes } = req.body;
    const instructorId = req.user._id || req.user.userId;
    
    // Verify instructor owns the class
    const classDoc = await Class.findById(classId);
    if (!classDoc) {
      return res.status(404).json({
        success: false,
        error: 'Class not found'
      });
    }
    
    if (classDoc.instructorId.toString() !== instructorId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Only the class instructor can add TAs'
      });
    }
    
    // Find the TA user
    const taUser = await User.findOne({ email: taEmail });
    if (!taUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found with that email address'
      });
    }
    
    // Check if already a TA
    const existingTA = await TAPermissions.findOne({ 
      classId, 
      taUserId: taUser._id 
    });
    
    if (existingTA) {
      return res.status(400).json({
        success: false,
        error: 'This user is already a TA for this class'
      });
    }
    
    // Create TA permissions
    const taPermissions = new TAPermissions({
      classId,
      taUserId: taUser._id,
      grantedBy: instructorId,
      sessionPermissions: permissions.session || {},
      questionPermissions: permissions.question || {},
      studentPermissions: permissions.student || {},
      analyticsPermissions: permissions.analytics || {},
      contentPermissions: permissions.content || {},
      adminPermissions: permissions.admin || {},
      timeRestrictions: timeRestrictions || {},
      notes
    });
    
    await taPermissions.save();
    
    // Also add to class teachingAssistants array
    if (!classDoc.teachingAssistants) {
      classDoc.teachingAssistants = [];
    }
    if (!classDoc.teachingAssistants.includes(taUser._id)) {
      classDoc.teachingAssistants.push(taUser._id);
      await classDoc.save();
    }
    
    res.json({
      success: true,
      message: 'Teaching assistant added successfully',
      ta: {
        id: taPermissions._id,
        name: `${taUser.firstName} ${taUser.lastName}`,
        email: taUser.email,
        permissions: taPermissions
      }
    });
    
  } catch (error) {
    console.error('Error adding TA:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add teaching assistant'
    });
  }
});

/**
 * Update TA permissions (instructor only)
 */
router.put('/class/:classId/tas/:taId', auth, [
  param('classId').isMongoId(),
  param('taId').isMongoId(),
  body('permissions').optional().isObject(),
  body('timeRestrictions').optional().isObject(),
  body('isActive').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }
    
    const { classId, taId } = req.params;
    const updates = req.body;
    const instructorId = req.user._id || req.user.userId;
    
    // Verify instructor owns the class
    const classDoc = await Class.findById(classId);
    if (!classDoc) {
      return res.status(404).json({
        success: false,
        error: 'Class not found'
      });
    }
    
    if (classDoc.instructorId.toString() !== instructorId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Only the class instructor can update TA permissions'
      });
    }
    
    // Find and update TA permissions
    const taPermissions = await TAPermissions.findOne({ 
      _id: taId,
      classId 
    });
    
    if (!taPermissions) {
      return res.status(404).json({
        success: false,
        error: 'TA permissions not found'
      });
    }
    
    // Update permissions
    if (updates.permissions) {
      if (updates.permissions.session) {
        Object.assign(taPermissions.sessionPermissions, updates.permissions.session);
      }
      if (updates.permissions.question) {
        Object.assign(taPermissions.questionPermissions, updates.permissions.question);
      }
      if (updates.permissions.student) {
        Object.assign(taPermissions.studentPermissions, updates.permissions.student);
      }
      if (updates.permissions.analytics) {
        Object.assign(taPermissions.analyticsPermissions, updates.permissions.analytics);
      }
      if (updates.permissions.content) {
        Object.assign(taPermissions.contentPermissions, updates.permissions.content);
      }
      if (updates.permissions.admin) {
        Object.assign(taPermissions.adminPermissions, updates.permissions.admin);
      }
    }
    
    if (updates.timeRestrictions) {
      Object.assign(taPermissions.timeRestrictions, updates.timeRestrictions);
    }
    
    if (updates.isActive !== undefined) {
      taPermissions.isActive = updates.isActive;
    }
    
    if (updates.notes !== undefined) {
      taPermissions.notes = updates.notes;
    }
    
    await taPermissions.save();
    
    res.json({
      success: true,
      message: 'TA permissions updated successfully',
      permissions: taPermissions
    });
    
  } catch (error) {
    console.error('Error updating TA:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update TA permissions'
    });
  }
});

/**
 * Remove a TA from a class (instructor only)
 */
router.delete('/class/:classId/tas/:taId', auth, async (req, res) => {
  try {
    const { classId, taId } = req.params;
    const instructorId = req.user._id || req.user.userId;
    
    // Verify instructor owns the class
    const classDoc = await Class.findById(classId);
    if (!classDoc) {
      return res.status(404).json({
        success: false,
        error: 'Class not found'
      });
    }
    
    if (classDoc.instructorId.toString() !== instructorId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Only the class instructor can remove TAs'
      });
    }
    
    // Find and delete TA permissions
    const taPermissions = await TAPermissions.findOneAndDelete({ 
      _id: taId,
      classId 
    });
    
    if (!taPermissions) {
      return res.status(404).json({
        success: false,
        error: 'TA permissions not found'
      });
    }
    
    // Remove from class teachingAssistants array
    classDoc.teachingAssistants = classDoc.teachingAssistants.filter(
      id => id.toString() !== taPermissions.taUserId.toString()
    );
    await classDoc.save();
    
    res.json({
      success: true,
      message: 'Teaching assistant removed successfully'
    });
    
  } catch (error) {
    console.error('Error removing TA:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove teaching assistant'
    });
  }
});

/**
 * Get my TA permissions for a class (TA endpoint)
 */
router.get('/my-permissions/:classId', auth, async (req, res) => {
  try {
    const { classId } = req.params;
    const userId = req.user._id || req.user.userId;
    
    const permissions = await TAPermissions.getPermissionsFor(userId, classId);
    
    if (!permissions) {
      return res.status(404).json({
        success: false,
        error: 'You do not have TA permissions for this class'
      });
    }
    
    res.json({
      success: true,
      permissions: {
        session: permissions.sessionPermissions,
        question: permissions.questionPermissions,
        student: permissions.studentPermissions,
        analytics: permissions.analyticsPermissions,
        content: permissions.contentPermissions,
        admin: permissions.adminPermissions
      },
      timeRestrictions: permissions.timeRestrictions,
      isCurrentlyValid: permissions.isCurrentlyValid()
    });
    
  } catch (error) {
    console.error('Error fetching TA permissions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch permissions'
    });
  }
});

/**
 * Get list of available permissions (for UI)
 */
router.get('/available-permissions', auth, (req, res) => {
  res.json({
    success: true,
    permissions: checkTAPermission.availablePermissions
  });
});

module.exports = router;
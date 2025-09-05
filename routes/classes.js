const express = require('express');
const router = express.Router();
const Class = require('../models/Class');
const auth = require('../middleware/auth');

// Create a new class
router.post('/', auth, async (req, res) => {
  try {
    const { name, description, semester, year } = req.body;
    
    // Generate unique class code
    let classCode;
    let codeExists = true;
    
    while (codeExists) {
      classCode = Class.generateClassCode();
      const existing = await Class.findOne({ code: classCode });
      if (!existing) {
        codeExists = false;
      }
    }
    
    const newClass = new Class({
      name,
      code: classCode,
      description,
      semester,
      year: year || new Date().getFullYear(),
      instructorId: req.user.userId || req.user.id
    });
    
    await newClass.save();
    
    res.json({
      success: true,
      class: newClass
    });
    
  } catch (error) {
    console.error('Error creating class:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get all classes for instructor
router.get('/', auth, async (req, res) => {
  try {
    const classes = await Class.find({ 
      instructorId: req.user.userId || req.user.id,
      isActive: true 
    }).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      classes
    });
    
  } catch (error) {
    console.error('Error getting classes:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get class by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const classData = await Class.findOne({
      _id: req.params.id,
      instructorId: req.user.userId || req.user.id
    }).populate('students.userId', 'name email');
    
    if (!classData) {
      return res.status(404).json({ 
        success: false, 
        error: 'Class not found' 
      });
    }
    
    res.json({
      success: true,
      class: classData
    });
    
  } catch (error) {
    console.error('Error getting class:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Update class
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, description, semester, year, isActive } = req.body;
    
    const classData = await Class.findOneAndUpdate(
      {
        _id: req.params.id,
        instructorId: req.user.userId || req.user.id
      },
      {
        name,
        description,
        semester,
        year,
        isActive,
        updatedAt: Date.now()
      },
      { new: true }
    );
    
    if (!classData) {
      return res.status(404).json({ 
        success: false, 
        error: 'Class not found' 
      });
    }
    
    res.json({
      success: true,
      class: classData
    });
    
  } catch (error) {
    console.error('Error updating class:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Add student to class
router.post('/:id/students', auth, async (req, res) => {
  try {
    const { userId, studentId, name, email } = req.body;
    
    const classData = await Class.findOne({
      _id: req.params.id,
      instructorId: req.user.userId || req.user.id
    });
    
    if (!classData) {
      return res.status(404).json({ 
        success: false, 
        error: 'Class not found' 
      });
    }
    
    // Check if student already in class
    const existingStudent = classData.students.find(s => 
      (userId && s.userId?.toString() === userId) ||
      (email && s.email === email)
    );
    
    if (existingStudent) {
      return res.status(400).json({ 
        success: false, 
        error: 'Student already enrolled in this class' 
      });
    }
    
    // Add student
    classData.students.push({
      userId: userId || null,
      studentId,
      name,
      email
    });
    
    await classData.save();
    
    res.json({
      success: true,
      class: classData
    });
    
  } catch (error) {
    console.error('Error adding student:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Remove student from class
router.delete('/:id/students/:studentId', auth, async (req, res) => {
  try {
    const classData = await Class.findOne({
      _id: req.params.id,
      instructorId: req.user.userId || req.user.id
    });
    
    if (!classData) {
      return res.status(404).json({ 
        success: false, 
        error: 'Class not found' 
      });
    }
    
    // Remove student
    classData.students = classData.students.filter(s => 
      s._id.toString() !== req.params.studentId
    );
    
    await classData.save();
    
    res.json({
      success: true,
      class: classData
    });
    
  } catch (error) {
    console.error('Error removing student:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Join class as student (using class code)
router.post('/join', auth, async (req, res) => {
  try {
    const { classCode } = req.body;
    
    const classData = await Class.findOne({ 
      code: classCode.toUpperCase(),
      isActive: true 
    });
    
    if (!classData) {
      return res.status(404).json({ 
        success: false, 
        error: 'Class not found or inactive' 
      });
    }
    
    // Check if student already in class
    const userId = req.user.userId || req.user.id;
    const existingStudent = classData.students.find(s => 
      s.userId?.toString() === userId
    );
    
    if (existingStudent) {
      return res.status(400).json({ 
        success: false, 
        error: 'You are already enrolled in this class' 
      });
    }
    
    // Add student
    classData.students.push({
      userId: userId,
      name: req.user.name,
      email: req.user.email
    });
    
    await classData.save();
    
    res.json({
      success: true,
      message: 'Successfully joined class',
      class: {
        id: classData._id,
        name: classData.name,
        code: classData.code,
        instructor: classData.instructorId
      }
    });
    
  } catch (error) {
    console.error('Error joining class:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;
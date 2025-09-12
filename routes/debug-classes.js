const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Class = require('../models/Class');

// GET /api/debug-classes/raw - Get classes without population
router.get('/raw', auth, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id || req.user.userId;
    
    // Get classes WITHOUT populating
    const classes = await Class.find({
      $or: [
        { instructorId: userId },
        { coInstructors: userId },
        { teachingAssistants: userId }
      ]
    }).select('name code joinCode instructorId createdAt');
    
    res.json({
      userId,
      userFromToken: req.user,
      classCount: classes.length,
      classes: classes.map(c => ({
        _id: c._id,
        name: c.name,
        code: c.code,
        joinCode: c.joinCode,
        instructorId: c.instructorId,
        instructorIdType: typeof c.instructorId,
        isOwner: String(c.instructorId) === String(userId),
        created: c.createdAt
      }))
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/debug-classes/check/:id - Check specific class ownership
router.get('/check/:id', auth, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id || req.user.userId;
    const classId = req.params.id;
    
    const classDoc = await Class.findById(classId).select('name instructorId');
    
    if (!classDoc) {
      return res.status(404).json({ error: 'Class not found' });
    }
    
    res.json({
      class: {
        _id: classDoc._id,
        name: classDoc.name,
        instructorId: classDoc.instructorId,
        instructorIdString: String(classDoc.instructorId)
      },
      user: {
        userId,
        userIdString: String(userId)
      },
      ownership: {
        isOwner: String(classDoc.instructorId) === String(userId),
        comparison: `"${String(classDoc.instructorId)}" === "${String(userId)}"`
      }
    });
  } catch (error) {
    console.error('Debug check error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
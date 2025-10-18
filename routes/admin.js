const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Student = require('../models/Student');
const User = require('../models/User');
const Class = require('../models/Class');
const ClassEnrollment = require('../models/ClassEnrollment');
const Session = require('../models/Session');

// Middleware to check if user is admin
const isAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify admin status' });
  }
};

// GET /api/admin/users - Get all users (instructors and students)
router.get('/users', auth, isAdmin, async (req, res) => {
  try {
    const { search, type, limit = 50, skip = 0 } = req.query;

    let query = {};
    if (search) {
      query = {
        $or: [
          { email: { $regex: search, $options: 'i' } },
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } }
        ]
      };
    }

    let users = [];

    // Get instructors
    if (!type || type === 'instructor') {
      const instructors = await User.find(query)
        .select('firstName lastName email role emailVerified createdAt')
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .sort({ createdAt: -1 });

      users.push(...instructors.map(u => ({
        ...u.toObject(),
        userType: 'instructor'
      })));
    }

    // Get students
    if (!type || type === 'student') {
      const studentQuery = search ? {
        $or: [
          { email: { $regex: search, $options: 'i' } },
          { 'profile.firstName': { $regex: search, $options: 'i' } },
          { 'profile.lastName': { $regex: search, $options: 'i' } }
        ]
      } : {};

      const students = await Student.find(studentQuery)
        .select('email profile verification createdAt')
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .sort({ createdAt: -1 });

      users.push(...students.map(s => ({
        _id: s._id,
        firstName: s.profile?.firstName,
        lastName: s.profile?.lastName,
        email: s.email,
        emailVerified: s.verification?.emailVerified,
        createdAt: s.createdAt,
        userType: 'student'
      })));
    }

    res.json({
      success: true,
      users,
      total: users.length
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET /api/admin/user/:email - Get detailed user info by email
router.get('/user/:email', auth, isAdmin, async (req, res) => {
  try {
    const email = req.params.email.toLowerCase();

    // Check if instructor
    const instructor = await User.findOne({ email });

    // Check if student
    const student = await Student.findOne({ email });

    if (!instructor && !student) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = {
      success: true,
      email
    };

    if (instructor) {
      result.instructor = {
        _id: instructor._id,
        firstName: instructor.firstName,
        lastName: instructor.lastName,
        email: instructor.email,
        role: instructor.role,
        emailVerified: instructor.emailVerified,
        verifiedAt: instructor.verifiedAt,
        createdAt: instructor.createdAt,
        lastLogin: instructor.lastLogin
      };

      // Get classes created by instructor
      const classes = await Class.find({ instructorId: instructor._id })
        .select('name code joinCode status');
      result.instructor.classesCreated = classes;
    }

    if (student) {
      result.student = {
        _id: student._id,
        email: student.email,
        firstName: student.profile?.firstName,
        lastName: student.profile?.lastName,
        emailVerified: student.verification?.emailVerified,
        verifiedAt: student.verification?.verifiedAt,
        createdAt: student.createdAt,
        lastLogin: student.lastLogin
      };

      // Get enrollments
      const enrollments = await ClassEnrollment.find({ studentId: student._id })
        .populate('classId', 'name code joinCode instructorId')
        .sort({ enrolledAt: -1 });

      result.student.enrollments = enrollments.map(e => ({
        classId: e.classId?._id,
        className: e.classId?.name,
        classCode: e.classId?.code,
        status: e.status,
        enrolledAt: e.enrolledAt,
        enrollmentMethod: e.enrollmentMethod
      }));
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

// POST /api/admin/diagnose-enrollment - Diagnose enrollment issue
router.post('/diagnose-enrollment', auth, isAdmin, async (req, res) => {
  try {
    const { email, joinCode } = req.body;

    const diagnosis = {
      email,
      joinCode,
      issues: [],
      warnings: [],
      info: []
    };

    // 1. Check if class exists
    const classDoc = await Class.findOne({ joinCode: joinCode.toUpperCase() })
      .populate('instructorId', 'firstName lastName email');

    if (!classDoc) {
      diagnosis.issues.push('Class with this join code does not exist');
      return res.json({ success: true, diagnosis });
    }

    diagnosis.info.push(`Class found: "${classDoc.name}" (ID: ${classDoc._id})`);
    diagnosis.classInfo = {
      id: classDoc._id,
      name: classDoc.name,
      instructor: `${classDoc.instructorId.firstName} ${classDoc.instructorId.lastName}`,
      status: classDoc.status
    };

    // 2. Check join code validity
    if (classDoc.joinCodeExpiry && new Date(classDoc.joinCodeExpiry) < new Date()) {
      diagnosis.issues.push(`Join code expired on ${classDoc.joinCodeExpiry}`);
    }

    if (classDoc.joinCodeMaxUses && classDoc.joinCodeUsageCount >= classDoc.joinCodeMaxUses) {
      diagnosis.issues.push(`Join code reached max uses (${classDoc.joinCodeUsageCount}/${classDoc.joinCodeMaxUses})`);
    }

    diagnosis.info.push(`Join code usage: ${classDoc.joinCodeUsageCount || 0} / ${classDoc.joinCodeMaxUses || 'unlimited'}`);

    // 3. Check enrollment settings
    if (classDoc.enrollmentDeadline && new Date(classDoc.enrollmentDeadline) < new Date()) {
      diagnosis.issues.push(`Enrollment closed on ${classDoc.enrollmentDeadline}`);
    }

    if (classDoc.requireApproval) {
      diagnosis.warnings.push('Class requires instructor approval for enrollment');
    }

    // 4. Check if student exists
    const student = await Student.findOne({ email: email.toLowerCase() });

    if (!student) {
      diagnosis.issues.push('Student account not found - student needs to register first');
      return res.json({ success: true, diagnosis });
    }

    diagnosis.info.push(`Student found: ${student.profile?.firstName} ${student.profile?.lastName} (ID: ${student._id})`);
    diagnosis.studentInfo = {
      id: student._id,
      name: `${student.profile?.firstName} ${student.profile?.lastName}`,
      emailVerified: student.verification?.emailVerified,
      createdAt: student.createdAt
    };

    if (!student.verification?.emailVerified) {
      diagnosis.warnings.push('Student email is not verified');
    }

    // 5. Check existing enrollment
    const enrollment = await ClassEnrollment.findOne({
      classId: classDoc._id,
      studentId: student._id
    });

    if (enrollment) {
      diagnosis.enrollmentInfo = {
        status: enrollment.status,
        enrolledAt: enrollment.enrolledAt,
        method: enrollment.enrollmentMethod
      };

      if (enrollment.status === 'enrolled') {
        diagnosis.issues.push('Student is already enrolled in this class');
      } else if (enrollment.status === 'blocked') {
        diagnosis.issues.push('Student is blocked from this class');
      } else if (enrollment.status === 'pending') {
        diagnosis.warnings.push('Student enrollment is pending instructor approval');
      } else if (enrollment.status === 'dropped') {
        diagnosis.info.push('Student previously dropped this class but can re-enroll');
      }
    } else {
      diagnosis.info.push('No existing enrollment - student can join');
    }

    // 6. Summary
    if (diagnosis.issues.length === 0 && diagnosis.warnings.length === 0) {
      diagnosis.summary = 'No issues found - enrollment should work';
    } else if (diagnosis.issues.length > 0) {
      diagnosis.summary = 'Issues found that prevent enrollment';
    } else {
      diagnosis.summary = 'Warnings found but enrollment should work';
    }

    res.json({ success: true, diagnosis });
  } catch (error) {
    console.error('Error diagnosing enrollment:', error);
    res.status(500).json({ error: 'Failed to diagnose enrollment' });
  }
});

// GET /api/admin/stats - Get system stats
router.get('/stats', auth, isAdmin, async (req, res) => {
  try {
    const [
      totalInstructors,
      totalStudents,
      totalClasses,
      totalEnrollments,
      activeClasses
    ] = await Promise.all([
      User.countDocuments(),
      Student.countDocuments(),
      Class.countDocuments(),
      ClassEnrollment.countDocuments({ status: 'enrolled' }),
      Class.countDocuments({ status: 'active' })
    ]);

    res.json({
      success: true,
      stats: {
        totalInstructors,
        totalStudents,
        totalClasses,
        totalEnrollments,
        activeClasses
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// POST /api/admin/verify-student-email - Manually verify a student's email
router.post('/verify-student-email', auth, isAdmin, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const student = await Student.findOne({ email: email.toLowerCase() });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    if (student.verification?.emailVerified) {
      return res.json({
        success: true,
        message: 'Email is already verified',
        student: {
          email: student.email,
          name: `${student.profile?.firstName} ${student.profile?.lastName}`,
          verified: true
        }
      });
    }

    // Verify the email
    if (!student.verification) {
      student.verification = {};
    }
    student.verification.emailVerified = true;
    student.verification.verifiedAt = new Date();
    await student.save();

    res.json({
      success: true,
      message: 'Email verified successfully',
      student: {
        email: student.email,
        name: `${student.profile?.firstName} ${student.profile?.lastName}`,
        verified: true
      }
    });
  } catch (error) {
    console.error('Error verifying email:', error);
    res.status(500).json({ error: 'Failed to verify email' });
  }
});

/**
 * Backfill enrollment stats from existing session data (Simple Auth)
 * GET /api/admin/backfill-enrollment-stats-simple?secret=BACKFILL2025
 */
router.get('/backfill-enrollment-stats-simple', async (req, res) => {
  try {
    // Simple secret check (temporary for backfill)
    if (req.query.secret !== 'BACKFILL2025') {
      return res.status(403).json({ success: false, error: 'Invalid secret' });
    }

    console.log('[Admin] Starting enrollment stats backfill...');

    const enrollments = await ClassEnrollment.find({ status: 'enrolled' });
    console.log(`[Admin] Found ${enrollments.length} enrollments to process`);

    const results = {
      total: enrollments.length,
      updated: 0,
      skipped: 0,
      details: []
    };

    for (const enrollment of enrollments) {
      const { studentId, classId } = enrollment;

      console.log(`[Admin] Processing: Student ${studentId}, Class ${classId}`);

      const sessions = await Session.find({ classId });
      console.log(`[Admin]   Found ${sessions.length} sessions for this class`);

      if (sessions.length === 0) {
        console.log(`[Admin]   Skipping - no sessions found`);
        results.skipped++;
        continue;
      }

      let totalQuestionsAnswered = 0;
      let totalCorrectAnswers = 0;
      let sessionsAttendedSet = new Set();
      let lastAttendanceDate = null;

      for (const session of sessions) {
        const participated = session.participants.some(p =>
          p.userId && p.userId.toString() === studentId.toString()
        );

        if (participated) {
          sessionsAttendedSet.add(session._id.toString());

          const participant = session.participants.find(p =>
            p.userId && p.userId.toString() === studentId.toString()
          );
          if (participant && participant.joinedAt) {
            if (!lastAttendanceDate || participant.joinedAt > lastAttendanceDate) {
              lastAttendanceDate = participant.joinedAt;
            }
          }

          // CRITICAL FIX: Match responses by participantId, not userId
          // Responses only store participantId, not userId
          if (participant && participant.participantId) {
            const studentResponses = session.responses.filter(r =>
              r.participantId === participant.participantId
            );

            totalQuestionsAnswered += studentResponses.length;

            for (const response of studentResponses) {
              if (response.correctAnswer !== undefined && response.answer !== null) {
                const isCorrect = String(response.answer).toLowerCase().trim() ===
                                String(response.correctAnswer).toLowerCase().trim();
                if (isCorrect) {
                  totalCorrectAnswers++;
                }
              }
            }
          }
        }
      }

      const sessionsAttended = sessionsAttendedSet.size;

      enrollment.stats.questionsAnswered = totalQuestionsAnswered;
      enrollment.stats.correctAnswers = totalCorrectAnswers;
      enrollment.stats.sessionsAttended = sessionsAttended;
      enrollment.stats.totalSessions = sessions.length;
      if (lastAttendanceDate) {
        enrollment.stats.lastAttendanceDate = lastAttendanceDate;
      }

      await enrollment.save();

      const detail = {
        studentId: studentId.toString(),
        classId: classId.toString(),
        sessionsAttended,
        totalSessions: sessions.length,
        questionsAnswered: totalQuestionsAnswered,
        correctAnswers: totalCorrectAnswers,
        lastAttendanceDate: lastAttendanceDate ? lastAttendanceDate.toISOString() : null
      };

      console.log(`[Admin]   ✅ Updated stats:`, detail);
      results.details.push(detail);
      results.updated++;
    }

    console.log(`[Admin] Backfill complete! Updated: ${results.updated}, Skipped: ${results.skipped}`);

    res.json({
      success: true,
      message: 'Enrollment stats backfill completed',
      results
    });

  } catch (error) {
    console.error('[Admin] Error during backfill:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Backfill enrollment stats from existing session data
 * GET /api/admin/backfill-enrollment-stats
 */
router.get('/backfill-enrollment-stats', auth, async (req, res) => {
  try {
    // Allow instructors to backfill their own classes
    console.log('[Admin] Starting enrollment stats backfill...');

    const enrollments = await ClassEnrollment.find({ status: 'enrolled' });
    console.log(`[Admin] Found ${enrollments.length} enrollments to process`);

    const results = {
      total: enrollments.length,
      updated: 0,
      skipped: 0,
      details: []
    };

    for (const enrollment of enrollments) {
      const { studentId, classId } = enrollment;

      console.log(`[Admin] Processing: Student ${studentId}, Class ${classId}`);

      const sessions = await Session.find({ classId });
      console.log(`[Admin]   Found ${sessions.length} sessions for this class`);

      if (sessions.length === 0) {
        console.log(`[Admin]   Skipping - no sessions found`);
        results.skipped++;
        continue;
      }

      let totalQuestionsAnswered = 0;
      let totalCorrectAnswers = 0;
      let sessionsAttendedSet = new Set();
      let lastAttendanceDate = null;

      for (const session of sessions) {
        const participated = session.participants.some(p =>
          p.userId && p.userId.toString() === studentId.toString()
        );

        if (participated) {
          sessionsAttendedSet.add(session._id.toString());

          const participant = session.participants.find(p =>
            p.userId && p.userId.toString() === studentId.toString()
          );
          if (participant && participant.joinedAt) {
            if (!lastAttendanceDate || participant.joinedAt > lastAttendanceDate) {
              lastAttendanceDate = participant.joinedAt;
            }
          }

          // CRITICAL FIX: Match responses by participantId, not userId
          // Responses only store participantId, not userId
          if (participant && participant.participantId) {
            const studentResponses = session.responses.filter(r =>
              r.participantId === participant.participantId
            );

            totalQuestionsAnswered += studentResponses.length;

            for (const response of studentResponses) {
              if (response.correctAnswer !== undefined && response.answer !== null) {
                const isCorrect = String(response.answer).toLowerCase().trim() ===
                                String(response.correctAnswer).toLowerCase().trim();
                if (isCorrect) {
                  totalCorrectAnswers++;
                }
              }
            }
          }
        }
      }

      const sessionsAttended = sessionsAttendedSet.size;

      enrollment.stats.questionsAnswered = totalQuestionsAnswered;
      enrollment.stats.correctAnswers = totalCorrectAnswers;
      enrollment.stats.sessionsAttended = sessionsAttended;
      enrollment.stats.totalSessions = sessions.length;
      if (lastAttendanceDate) {
        enrollment.stats.lastAttendanceDate = lastAttendanceDate;
      }

      await enrollment.save();

      const detail = {
        studentId: studentId.toString(),
        classId: classId.toString(),
        sessionsAttended,
        totalSessions: sessions.length,
        questionsAnswered: totalQuestionsAnswered,
        correctAnswers: totalCorrectAnswers,
        lastAttendanceDate: lastAttendanceDate ? lastAttendanceDate.toISOString() : null
      };

      console.log(`[Admin]   ✅ Updated stats:`, detail);
      results.details.push(detail);
      results.updated++;
    }

    console.log(`[Admin] Backfill complete! Updated: ${results.updated}, Skipped: ${results.skipped}`);

    res.json({
      success: true,
      message: 'Enrollment stats backfill completed',
      results
    });

  } catch (error) {
    console.error('[Admin] Error during backfill:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

/**
 * Backfill ClassEnrollment Stats
 *
 * This script calculates and updates stats for all ClassEnrollment records
 * based on existing session response data.
 *
 * Usage: node scripts/backfill-enrollment-stats.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ClassEnrollment = require('../models/ClassEnrollment');
const Session = require('../models/Session');

async function backfillEnrollmentStats() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get all enrollments
    const enrollments = await ClassEnrollment.find({ status: 'enrolled' });
    console.log(`Found ${enrollments.length} enrollments to process`);

    let updated = 0;
    let skipped = 0;

    for (const enrollment of enrollments) {
      const { studentId, classId } = enrollment;

      console.log(`\nProcessing enrollment: Student ${studentId}, Class ${classId}`);

      // Find all sessions for this class
      const sessions = await Session.find({ classId });
      console.log(`  Found ${sessions.length} sessions for this class`);

      if (sessions.length === 0) {
        console.log(`  Skipping - no sessions found`);
        skipped++;
        continue;
      }

      let totalQuestionsAnswered = 0;
      let totalCorrectAnswers = 0;
      let sessionsAttendedSet = new Set();
      let lastAttendanceDate = null;

      // Process each session
      for (const session of sessions) {
        // Check if student participated
        const participated = session.participants.some(p =>
          p.userId && p.userId.toString() === studentId.toString()
        );

        if (participated) {
          sessionsAttendedSet.add(session._id.toString());

          // Update last attendance date
          const participant = session.participants.find(p =>
            p.userId && p.userId.toString() === studentId.toString()
          );
          if (participant && participant.joinedAt) {
            if (!lastAttendanceDate || participant.joinedAt > lastAttendanceDate) {
              lastAttendanceDate = participant.joinedAt;
            }
          }
        }

        // Count responses from this student
        const studentResponses = session.responses.filter(r =>
          r.userId && r.userId.toString() === studentId.toString()
        );

        totalQuestionsAnswered += studentResponses.length;

        // Count correct answers
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

      const sessionsAttended = sessionsAttendedSet.size;

      // Update enrollment stats
      enrollment.stats.questionsAnswered = totalQuestionsAnswered;
      enrollment.stats.correctAnswers = totalCorrectAnswers;
      enrollment.stats.sessionsAttended = sessionsAttended;
      enrollment.stats.totalSessions = sessions.length;
      if (lastAttendanceDate) {
        enrollment.stats.lastAttendanceDate = lastAttendanceDate;
      }

      await enrollment.save();

      console.log(`  ✅ Updated stats:`);
      console.log(`     Sessions Attended: ${sessionsAttended} / ${sessions.length}`);
      console.log(`     Questions Answered: ${totalQuestionsAnswered}`);
      console.log(`     Correct Answers: ${totalCorrectAnswers}`);
      if (lastAttendanceDate) {
        console.log(`     Last Attendance: ${lastAttendanceDate.toISOString()}`);
      }

      updated++;
    }

    console.log(`\n✅ Backfill complete!`);
    console.log(`   Updated: ${updated} enrollments`);
    console.log(`   Skipped: ${skipped} enrollments (no sessions)`);

  } catch (error) {
    console.error('Error during backfill:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the script
backfillEnrollmentStats();

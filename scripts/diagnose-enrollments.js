/**
 * Diagnose Enrollment Data
 *
 * Shows what data exists in the database for debugging
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ClassEnrollment = require('../models/ClassEnrollment');
const Class = require('../models/Class');
const Session = require('../models/Session');
const User = require('../models/User');

async function diagnoseEnrollments() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Check users
    const users = await User.find({});
    console.log(`=== USERS (${users.length} found) ===`);
    users.forEach(u => {
      console.log(`  ${u._id} - ${u.name} (${u.email}) - Role: ${u.role}`);
    });

    // Check classes
    const classes = await Class.find({});
    console.log(`\n=== CLASSES (${classes.length} found) ===`);
    classes.forEach(c => {
      console.log(`  ${c._id} - ${c.name} (Code: ${c.classCode})`);
      console.log(`    Instructor: ${c.instructorId}`);
    });

    // Check enrollments (all statuses)
    const allEnrollments = await ClassEnrollment.find({});
    console.log(`\n=== ALL ENROLLMENTS (${allEnrollments.length} found) ===`);
    allEnrollments.forEach(e => {
      console.log(`  ${e._id}`);
      console.log(`    Student: ${e.studentId}`);
      console.log(`    Class: ${e.classId}`);
      console.log(`    Status: ${e.status}`);
      console.log(`    Stats: ${JSON.stringify(e.stats)}`);
    });

    // Check sessions
    const sessions = await Session.find({});
    console.log(`\n=== SESSIONS (${sessions.length} found) ===`);
    sessions.forEach(s => {
      console.log(`  ${s.sessionCode} - ${s.title}`);
      console.log(`    Class: ${s.classId || 'none'}`);
      console.log(`    Participants: ${s.participants.length}`);
      console.log(`    Responses: ${s.responses.length}`);
    });

    // Check which sessions have responses with userId
    console.log(`\n=== SESSIONS WITH USER RESPONSES ===`);
    const sessionsWithResponses = sessions.filter(s => s.responses.length > 0);
    sessionsWithResponses.forEach(s => {
      console.log(`  ${s.sessionCode} - ${s.title}`);
      const userResponses = s.responses.filter(r => r.userId);
      console.log(`    Total responses: ${s.responses.length}`);
      console.log(`    Responses with userId: ${userResponses.length}`);

      // Show unique users who responded
      const uniqueUsers = [...new Set(userResponses.map(r => r.userId.toString()))];
      console.log(`    Unique users: ${uniqueUsers.length}`);
      uniqueUsers.forEach(uid => {
        const userResponseCount = userResponses.filter(r => r.userId.toString() === uid).length;
        console.log(`      User ${uid}: ${userResponseCount} responses`);
      });
    });

  } catch (error) {
    console.error('Error during diagnosis:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run the script
diagnoseEnrollments();

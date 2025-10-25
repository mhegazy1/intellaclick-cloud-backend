// Script to manually verify a student's email
// Usage: node verify-student-email.js <email>

const mongoose = require('mongoose');
require('dotenv').config();

const Student = require('./models/Student');

async function verifyEmail(email) {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const student = await Student.findOne({ email: email.toLowerCase() });

    if (!student) {
      console.log(`❌ Student not found with email: ${email}`);
      process.exit(1);
    }

    console.log(`Found student: ${student.profile?.firstName} ${student.profile?.lastName}`);
    console.log(`Current verification status: ${student.verification?.emailVerified ? 'Verified' : 'NOT Verified'}`);

    if (student.verification?.emailVerified) {
      console.log('\n✅ Email is already verified!');
      mongoose.disconnect();
      process.exit(0);
    }

    // Verify the email
    if (!student.verification) {
      student.verification = {};
    }
    student.verification.emailVerified = true;
    student.verification.verifiedAt = new Date();
    await student.save();

    console.log(`\n✅ Successfully verified email for ${email}!`);
    console.log('Student can now join classes.');

    mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    mongoose.disconnect();
    process.exit(1);
  }
}

const email = process.argv[2];

if (!email) {
  console.log('Usage: node verify-student-email.js <email>');
  console.log('Example: node verify-student-email.js grace.anderson@my.smsu.edu');
  process.exit(1);
}

verifyEmail(email);

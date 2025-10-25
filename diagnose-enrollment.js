// Quick diagnostic script to check enrollment issues
// Usage: node diagnose-enrollment.js <joinCode> <studentEmail>

const mongoose = require('mongoose');
require('dotenv').config();

const Class = require('./models/Class');
const Student = require('./models/Student');
const ClassEnrollment = require('./models/ClassEnrollment');

async function diagnoseEnrollment(joinCode, studentEmail) {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    console.log('=== ENROLLMENT DIAGNOSTIC ===\n');
    console.log(`Join Code: ${joinCode}`);
    console.log(`Student Email: ${studentEmail}\n`);

    // 1. Check if class exists
    console.log('1. Checking if class exists...');
    const classDoc = await Class.findOne({ joinCode });
    if (!classDoc) {
      console.log('   ❌ PROBLEM: Class with this join code does not exist');
      process.exit(0);
    }
    console.log(`   ✅ Class found: "${classDoc.name}"`);
    console.log(`      - ID: ${classDoc._id}`);
    console.log(`      - Instructor: ${classDoc.instructorId}`);
    console.log(`      - Status: ${classDoc.status}\n`);

    // 2. Check join code validity
    console.log('2. Checking join code validity...');
    const hasExpiry = classDoc.joinCodeExpiry && new Date(classDoc.joinCodeExpiry) < new Date();
    const hasMaxUses = classDoc.joinCodeMaxUses && classDoc.joinCodeUsageCount >= classDoc.joinCodeMaxUses;

    if (hasExpiry) {
      console.log(`   ❌ PROBLEM: Join code expired on ${classDoc.joinCodeExpiry}`);
    } else if (hasMaxUses) {
      console.log(`   ❌ PROBLEM: Join code reached max uses (${classDoc.joinCodeMaxUses} / ${classDoc.joinCodeUsageCount})`);
    } else {
      console.log('   ✅ Join code is valid');
      console.log(`      - Usage: ${classDoc.joinCodeUsageCount || 0} / ${classDoc.joinCodeMaxUses || 'unlimited'}`);
      console.log(`      - Expires: ${classDoc.joinCodeExpiry || 'never'}\n`);
    }

    // 3. Check enrollment settings
    console.log('3. Checking enrollment settings...');
    const enrollmentClosed = classDoc.enrollmentDeadline && new Date(classDoc.enrollmentDeadline) < new Date();

    if (enrollmentClosed) {
      console.log(`   ❌ PROBLEM: Enrollment closed on ${classDoc.enrollmentDeadline}`);
    } else {
      console.log('   ✅ Enrollment is open');
      console.log(`      - Deadline: ${classDoc.enrollmentDeadline || 'none'}`);
      console.log(`      - Requires approval: ${classDoc.requireApproval ? 'yes' : 'no'}\n`);
    }

    // 4. Check if student exists
    console.log('4. Checking if student exists...');
    const student = await Student.findOne({ email: studentEmail });
    if (!student) {
      console.log('   ❌ PROBLEM: Student account not found with this email');
      console.log('      - Student may need to register first');
      process.exit(0);
    }
    console.log(`   ✅ Student found: ${student.profile?.firstName} ${student.profile?.lastName}`);
    console.log(`      - ID: ${student._id}`);
    console.log(`      - Email verified: ${student.verification?.emailVerified ? 'yes' : 'no'}\n`);

    // 5. Check existing enrollment
    console.log('5. Checking existing enrollment...');
    const enrollment = await ClassEnrollment.findOne({
      classId: classDoc._id,
      studentId: student._id
    });

    if (enrollment) {
      console.log(`   ⚠️  Enrollment exists with status: ${enrollment.status}`);
      console.log(`      - Enrolled at: ${enrollment.enrolledAt}`);
      console.log(`      - Method: ${enrollment.enrollmentMethod}`);

      if (enrollment.status === 'enrolled') {
        console.log('   ❌ PROBLEM: Student is already enrolled');
      } else if (enrollment.status === 'blocked') {
        console.log('   ❌ PROBLEM: Student is blocked from this class');
      } else if (enrollment.status === 'pending') {
        console.log('   ⚠️  Student enrollment is pending approval');
      } else if (enrollment.status === 'dropped') {
        console.log('   ℹ️  Student previously dropped this class (can re-enroll)');
      }
    } else {
      console.log('   ✅ No existing enrollment found (student can join)\n');
    }

    // 6. Summary
    console.log('\n=== SUMMARY ===');
    const issues = [];
    if (!classDoc) issues.push('Class not found');
    if (hasExpiry) issues.push('Join code expired');
    if (hasMaxUses) issues.push('Join code max uses reached');
    if (enrollmentClosed) issues.push('Enrollment closed');
    if (!student) issues.push('Student not found');
    if (enrollment?.status === 'enrolled') issues.push('Already enrolled');
    if (enrollment?.status === 'blocked') issues.push('Student is blocked');

    if (issues.length === 0) {
      console.log('✅ No issues found - enrollment should work');
      console.log('\nIf still failing, check:');
      console.log('  - Student authentication token is valid');
      console.log('  - Network/CORS issues');
      console.log('  - Server logs for detailed errors');
    } else {
      console.log('❌ Issues found:');
      issues.forEach(issue => console.log(`   - ${issue}`));
    }

    mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    mongoose.disconnect();
  }
}

// Get command line arguments
const joinCode = process.argv[2];
const studentEmail = process.argv[3];

if (!joinCode || !studentEmail) {
  console.log('Usage: node diagnose-enrollment.js <joinCode> <studentEmail>');
  console.log('Example: node diagnose-enrollment.js ABC123 student@email.com');
  process.exit(1);
}

diagnoseEnrollment(joinCode.toUpperCase(), studentEmail);

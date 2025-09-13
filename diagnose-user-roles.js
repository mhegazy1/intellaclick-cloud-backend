require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function diagnoseUserRoles() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/intellaclick';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB\n');

    // Find all users
    const allUsers = await User.find({}).select('-password');
    console.log(`Total users in database: ${allUsers.length}\n`);

    // Check for users without roles
    const usersWithoutRoles = allUsers.filter(user => !user.role);
    console.log(`Users without roles: ${usersWithoutRoles.length}`);
    
    if (usersWithoutRoles.length > 0) {
      console.log('\nUsers missing roles:');
      usersWithoutRoles.forEach(user => {
        console.log(`- ${user.email} (ID: ${user._id})`);
      });
    }

    // Check for users with invalid roles
    const validRoles = ['user', 'admin', 'instructor', 'teaching_assistant', 'student'];
    const usersWithInvalidRoles = allUsers.filter(user => user.role && !validRoles.includes(user.role));
    console.log(`\nUsers with invalid roles: ${usersWithInvalidRoles.length}`);
    
    if (usersWithInvalidRoles.length > 0) {
      console.log('\nUsers with invalid roles:');
      usersWithInvalidRoles.forEach(user => {
        console.log(`- ${user.email} has role: "${user.role}" (ID: ${user._id})`);
      });
    }

    // Show role distribution
    console.log('\nRole distribution:');
    const roleCount = {};
    allUsers.forEach(user => {
      const role = user.role || 'NOT SET';
      roleCount[role] = (roleCount[role] || 0) + 1;
    });
    
    Object.entries(roleCount).sort(([,a], [,b]) => b - a).forEach(([role, count]) => {
      console.log(`- ${role}: ${count} users`);
    });

    // Check a specific user if email is provided as command line argument
    if (process.argv[2]) {
      const email = process.argv[2];
      console.log(`\nChecking specific user: ${email}`);
      const user = await User.findOne({ email });
      if (user) {
        console.log('User found:');
        console.log(`- ID: ${user._id}`);
        console.log(`- Email: ${user.email}`);
        console.log(`- Name: ${user.firstName} ${user.lastName}`);
        console.log(`- Role: ${user.role || 'NOT SET'}`);
        console.log(`- Created: ${user.createdAt}`);
        console.log(`- Updated: ${user.updatedAt}`);
      } else {
        console.log('User not found');
      }
    }

    // Suggest fix
    if (usersWithoutRoles.length > 0) {
      console.log('\n=== Suggested Fix ===');
      console.log('To fix users without roles, you can run:');
      console.log('1. Set all users without roles to "instructor":');
      console.log('   await User.updateMany({ role: { $exists: false } }, { $set: { role: "instructor" } });\n');
      console.log('2. Or update specific users:');
      console.log('   await User.findByIdAndUpdate("USER_ID", { role: "instructor" });');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run the diagnosis
diagnoseUserRoles();
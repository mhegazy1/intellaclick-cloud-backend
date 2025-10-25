// Script to make a user an admin
// Usage: node make-admin.js <email>

const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/User');

async function makeAdmin(email) {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      console.log(`❌ User not found with email: ${email}`);
      console.log('\nMake sure the user has an instructor account first.');
      process.exit(1);
    }

    console.log(`Found user: ${user.firstName} ${user.lastName}`);
    console.log(`Current role: ${user.role}`);

    if (user.role === 'admin') {
      console.log('\n✅ User is already an admin!');
      process.exit(0);
    }

    // Update to admin
    user.role = 'admin';
    await user.save();

    console.log(`\n✅ Successfully updated ${email} to admin role!`);
    console.log('\nYou can now access the admin panel at:');
    console.log('https://instructor.intellaclick.com/admin.html');

    mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    mongoose.disconnect();
    process.exit(1);
  }
}

// Get email from command line
const email = process.argv[2];

if (!email) {
  console.log('Usage: node make-admin.js <email>');
  console.log('Example: node make-admin.js mostafa.afifi77@gmail.com');
  process.exit(1);
}

makeAdmin(email);

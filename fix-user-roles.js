require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function fixUserRoles() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/intellaclick';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB\n');

    // Find users without roles
    const usersWithoutRoles = await User.find({ 
      $or: [
        { role: { $exists: false } },
        { role: null },
        { role: '' },
        { role: 'NOT SET' }
      ]
    });

    console.log(`Found ${usersWithoutRoles.length} users without proper roles\n`);

    if (usersWithoutRoles.length === 0) {
      console.log('All users have roles set. No fixes needed.');
      return;
    }

    // Show users that will be updated
    console.log('Users to be updated:');
    usersWithoutRoles.forEach(user => {
      console.log(`- ${user.email} (ID: ${user._id}, Current role: ${user.role || 'undefined'})`);
    });

    // Ask for confirmation
    console.log('\nThese users will be set to role: "instructor"');
    console.log('To proceed, run this script with --confirm flag');
    
    if (process.argv.includes('--confirm')) {
      console.log('\nUpdating users...');
      
      let updateCount = 0;
      for (const user of usersWithoutRoles) {
        user.role = 'instructor';
        await user.save();
        updateCount++;
        console.log(`Updated ${user.email}`);
      }
      
      console.log(`\nSuccessfully updated ${updateCount} users`);
      
      // Verify the fix
      const stillWithoutRoles = await User.countDocuments({ 
        $or: [
          { role: { $exists: false } },
          { role: null },
          { role: '' },
          { role: 'NOT SET' }
        ]
      });
      
      console.log(`\nVerification: ${stillWithoutRoles} users still without roles`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run the fix
fixUserRoles();
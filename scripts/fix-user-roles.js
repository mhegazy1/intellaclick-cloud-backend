const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const User = require('../models/User');

async function fixUserRoles() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/intellaclick', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB');

    // Find all users without a role
    const usersWithoutRole = await User.find({ 
      $or: [
        { role: { $exists: false } },
        { role: null },
        { role: '' }
      ]
    });

    console.log(`Found ${usersWithoutRole.length} users without roles`);

    if (usersWithoutRole.length === 0) {
      console.log('All users already have roles set!');
      return;
    }

    // Update each user to have the instructor role
    for (const user of usersWithoutRole) {
      user.role = 'instructor';
      await user.save();
      console.log(`Updated user ${user.email} to have role: instructor`);
    }

    console.log('\nAll users have been updated with the instructor role');

    // Verify the fix
    const stillMissing = await User.countDocuments({ 
      $or: [
        { role: { $exists: false } },
        { role: null },
        { role: '' }
      ]
    });

    if (stillMissing === 0) {
      console.log('✅ Verification successful: All users now have roles');
    } else {
      console.log(`⚠️  Warning: ${stillMissing} users still missing roles`);
    }

  } catch (error) {
    console.error('Error fixing user roles:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

// Run the script
fixUserRoles();
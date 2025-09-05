const mongoose = require('mongoose');
const Session = require('./models/Session');
require('dotenv').config();

async function migrateRequireLogin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all sessions
    const sessions = await Session.find({});
    console.log(`Found ${sessions.length} sessions to check`);

    let updatedCount = 0;
    let missingCount = 0;

    for (const session of sessions) {
      // Check if requireLogin field exists
      const sessionObj = session.toObject();
      
      if (!('requireLogin' in sessionObj) || session.requireLogin === undefined || session.requireLogin === null) {
        missingCount++;
        console.log(`Session ${session.sessionCode} missing requireLogin field`);
        
        // Update the session with default value
        session.requireLogin = false;
        session.markModified('requireLogin');
        await session.save();
        
        updatedCount++;
        console.log(`Updated session ${session.sessionCode} with requireLogin: false`);
      }
    }

    console.log('\n--- Migration Summary ---');
    console.log(`Total sessions: ${sessions.length}`);
    console.log(`Sessions missing requireLogin: ${missingCount}`);
    console.log(`Sessions updated: ${updatedCount}`);

    // Verify the migration
    console.log('\n--- Verification ---');
    const verifySession = await Session.findOne({ sessionCode: 'PS32NM' });
    if (verifySession) {
      console.log('PS32NM session after migration:', {
        sessionCode: verifySession.sessionCode,
        requireLogin: verifySession.requireLogin,
        requireLoginExists: 'requireLogin' in verifySession.toObject()
      });
    }

  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

// Run the migration
migrateRequireLogin();
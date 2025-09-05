const mongoose = require('mongoose');
require('dotenv').config();

async function fixRequireLoginDirectly() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get direct access to the sessions collection
    const db = mongoose.connection.db;
    const collection = db.collection('sessions');

    // Update all documents that don't have requireLogin field
    console.log('Updating sessions without requireLogin field...');
    const updateResult = await collection.updateMany(
      { requireLogin: { $exists: false } },
      { $set: { requireLogin: false } }
    );

    console.log('Update result:', {
      matchedCount: updateResult.matchedCount,
      modifiedCount: updateResult.modifiedCount
    });

    // Also update documents where requireLogin is null
    const updateNullResult = await collection.updateMany(
      { requireLogin: null },
      { $set: { requireLogin: false } }
    );

    console.log('Update null values result:', {
      matchedCount: updateNullResult.matchedCount,
      modifiedCount: updateNullResult.modifiedCount
    });

    // Check specific session
    const ps32nmSession = await collection.findOne({ sessionCode: 'PS32NM' });
    if (ps32nmSession) {
      console.log('\nPS32NM session after fix:', {
        sessionCode: ps32nmSession.sessionCode,
        requireLogin: ps32nmSession.requireLogin,
        hasRequireLogin: 'requireLogin' in ps32nmSession
      });

      // If still missing, force update this specific session
      if (!('requireLogin' in ps32nmSession)) {
        console.log('Force updating PS32NM session...');
        await collection.updateOne(
          { sessionCode: 'PS32NM' },
          { $set: { requireLogin: true } } // Set to true based on your requirements
        );
        
        const updatedSession = await collection.findOne({ sessionCode: 'PS32NM' });
        console.log('PS32NM after force update:', updatedSession.requireLogin);
      }
    }

    // List all unique session codes with their requireLogin status
    console.log('\n--- All Sessions Status ---');
    const allSessions = await collection.find({}).project({ sessionCode: 1, requireLogin: 1 }).toArray();
    allSessions.forEach(session => {
      console.log(`${session.sessionCode}: requireLogin = ${session.requireLogin}`);
    });

  } catch (error) {
    console.error('Fix error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed');
  }
}

// Run the fix
fixRequireLoginDirectly();
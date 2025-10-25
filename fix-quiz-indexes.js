const mongoose = require('mongoose');
require('dotenv').config();

async function fixQuizIndexes() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      console.error('Error: MONGODB_URI not found in .env file');
      console.log('Please check your .env file contains MONGODB_URI');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const Quiz = mongoose.connection.collection('quizzes');

    // Drop the old syncId index
    try {
      await Quiz.dropIndex('syncId_1');
      console.log('✓ Dropped old syncId index');
    } catch (err) {
      console.log('No old index to drop (this is OK):', err.message);
    }

    // Create new sparse index
    await Quiz.createIndex({ syncId: 1 }, { unique: true, sparse: true });
    console.log('✓ Created new sparse syncId index');

    // Show all indexes
    const indexes = await Quiz.indexes();
    console.log('\nCurrent indexes:');
    indexes.forEach(idx => {
      console.log(`  - ${JSON.stringify(idx.key)}: ${JSON.stringify(idx)}`);
    });

    await mongoose.disconnect();
    console.log('\n✓ Done! You can now create quizzes.');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixQuizIndexes();

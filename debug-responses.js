// Debug script to check response issues
const mongoose = require('mongoose');
const Session = require('./models/Session');

// Load environment variables
require('dotenv').config();
// Also try loading from .env.production if NODE_ENV is production
if (process.env.NODE_ENV === 'production') {
  require('dotenv').config({ path: './.env.production' });
}

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/intellaclick';
console.log('Using MongoDB URI:', mongoUri);
console.log('Environment:', process.env.NODE_ENV);

async function debugResponses() {
  try {
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('Connected to MongoDB');
    
    // Find all sessions with code "QU2HFH" or your test code
    const testCode = process.argv[2] || 'QU2HFH';
    const sessions = await Session.find({ sessionCode: testCode.toUpperCase() });
    
    console.log(`\n=== Sessions with code ${testCode} ===`);
    console.log(`Found ${sessions.length} sessions`);
    
    for (const session of sessions) {
      console.log(`\n--- Session ${session._id} ---`);
      console.log(`Status: ${session.status}`);
      console.log(`Created: ${session.createdAt}`);
      console.log(`Participants: ${session.participants?.length || 0}`);
      console.log(`Responses: ${session.responses?.length || 0}`);
      
      if (session.currentQuestion) {
        console.log(`Current Question: ${session.currentQuestion.questionText}`);
        console.log(`Question ID: ${session.currentQuestion.questionId}`);
      }
      
      if (session.responses && session.responses.length > 0) {
        console.log('\nResponses:');
        session.responses.forEach((resp, idx) => {
          console.log(`  ${idx + 1}. Question: ${resp.questionId}, Answer: ${resp.answer}, Participant: ${resp.participantId}`);
        });
      }
    }
    
    // Check for orphaned responses
    console.log('\n=== Checking All Sessions for Responses ===');
    const allSessions = await Session.find({ 'responses.0': { $exists: true } });
    console.log(`Found ${allSessions.length} sessions with responses`);
    
    for (const session of allSessions) {
      console.log(`\nSession ${session.sessionCode} (${session._id}):`);
      console.log(`  Status: ${session.status}`);
      console.log(`  Responses: ${session.responses.length}`);
      console.log(`  Last response: ${session.responses[session.responses.length - 1]?.submittedAt}`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

debugResponses();
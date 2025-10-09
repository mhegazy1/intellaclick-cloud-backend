require('dotenv').config();
const mongoose = require('mongoose');
const Session = require('./models/Session');

async function checkSessions() {
  try {
    // Connect to MongoDB using environment variable
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      console.error('ERROR: No MongoDB URI found in environment');
      console.log('Available env vars:', Object.keys(process.env).filter(k => k.includes('MONGO')));
      return;
    }
    
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected successfully!\n');

    // 1. Check recent sessions
    console.log('=== RECENT SESSIONS WITH allowAnswerChange ===');
    const recentSessions = await Session.find({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    }).sort({ createdAt: -1 }).limit(10);
    
    console.log(`Found ${recentSessions.length} recent sessions:\n`);
    
    for (const session of recentSessions) {
      console.log(`Session Code: ${session.sessionCode}`);
      console.log(`  Title: ${session.title}`);
      console.log(`  Status: ${session.status}`);
      console.log(`  Allow Answer Change: ${session.allowAnswerChange}`);
      console.log(`  Created: ${session.createdAt}`);
      console.log('  ---');
    }

    // 2. Check if any sessions have allowAnswerChange = true
    console.log('\n=== SESSIONS WITH allowAnswerChange ENABLED ===');
    const sessionsWithChange = await Session.find({ allowAnswerChange: true });
    
    if (sessionsWithChange.length === 0) {
      console.log('No sessions found with allowAnswerChange enabled');
    } else {
      console.log(`Found ${sessionsWithChange.length} sessions with allowAnswerChange enabled:`);
      sessionsWithChange.forEach(s => {
        console.log(`  - ${s.sessionCode}: ${s.title} (${s.status})`);
      });
    }

    // 3. Create a test session
    console.log('\n=== CREATING TEST SESSION ===');
    const testCode = `TEST${Math.floor(Math.random() * 10000)}`;
    const testSession = new Session({
      sessionCode: testCode,
      title: 'Debug Test - Allow Answer Change',
      instructorId: new mongoose.Types.ObjectId(),
      allowAnswerChange: true,
      requireLogin: false,
      restrictToEnrolled: false,
      status: 'waiting'
    });
    
    await testSession.save();
    console.log(`Created test session: ${testCode}`);
    
    // 4. Verify it was saved correctly
    const savedSession = await Session.findOne({ sessionCode: testCode });
    console.log(`Verified allowAnswerChange = ${savedSession.allowAnswerChange}`);
    
    // 5. Test the response submission logic
    console.log('\n=== TESTING RESPONSE SUBMISSION ===');
    
    // Add a test response
    savedSession.responses.push({
      participantId: 'test-participant-1',
      questionId: 'Q1',
      answer: 'A',
      submittedAt: new Date()
    });
    await savedSession.save();
    console.log('Added initial response: Answer = A');
    
    // Try to change the answer
    const existingResponseIndex = savedSession.responses.findIndex(r => 
      r.participantId === 'test-participant-1' && r.questionId === 'Q1'
    );
    
    if (existingResponseIndex !== -1 && savedSession.allowAnswerChange) {
      savedSession.responses[existingResponseIndex].answer = 'B';
      savedSession.responses[existingResponseIndex].submittedAt = new Date();
      await savedSession.save();
      console.log('Successfully changed answer to B');
    }
    
    // Clean up
    await Session.deleteOne({ sessionCode: testCode });
    console.log('\nTest session cleaned up');
    
    // 6. Check specific session if provided
    const sessionCode = process.argv[2];
    if (sessionCode) {
      console.log(`\n=== CHECKING SESSION: ${sessionCode} ===`);
      const specificSession = await Session.findOne({ sessionCode: sessionCode.toUpperCase() });
      
      if (!specificSession) {
        console.log('Session not found');
      } else {
        console.log('Session Details:');
        console.log(`  Allow Answer Change: ${specificSession.allowAnswerChange}`);
        console.log(`  Responses: ${specificSession.responses.length}`);
        console.log(`  Status: ${specificSession.status}`);
        
        // Fix if needed
        if (specificSession.allowAnswerChange === undefined || specificSession.allowAnswerChange === null) {
          console.log('\nWARNING: allowAnswerChange is not set! Setting to false...');
          specificSession.allowAnswerChange = false;
          await specificSession.save();
          console.log('Fixed!');
        }
      }
    }

  } catch (error) {
    console.error('ERROR:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

console.log('=== INTELLACLICK ALLOW ANSWER CHANGE CHECK ===\n');
checkSessions();
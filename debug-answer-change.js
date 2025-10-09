const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Models
const Session = require('./models/Session');
const User = require('./models/User');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Helper function to log with color
function log(color, message, data) {
  console.log(`${colors[color]}${message}${colors.reset}`, data || '');
}

// Connect to MongoDB
async function connectDB() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/intellaclick';
    await mongoose.connect(mongoUri);
    log('green', '✓ Connected to MongoDB');
    return true;
  } catch (error) {
    log('red', '✗ MongoDB connection failed:', error.message);
    return false;
  }
}

// Test 1: Check if allowAnswerChange is properly set during session creation
async function testSessionCreation() {
  log('cyan', '\n=== TEST 1: Session Creation ===');
  
  try {
    // Create a test session with allowAnswerChange = true
    const testSession = new Session({
      sessionCode: `TEST${Date.now()}`,
      title: 'Debug Test Session',
      description: 'Testing allowAnswerChange functionality',
      instructorId: new mongoose.Types.ObjectId(),
      status: 'waiting',
      allowAnswerChange: true,
      requireLogin: false,
      restrictToEnrolled: false
    });

    log('blue', 'Creating session with allowAnswerChange:', testSession.allowAnswerChange);
    
    await testSession.save();
    log('green', '✓ Session created successfully');

    // Verify it was saved correctly
    const savedSession = await Session.findById(testSession._id);
    log('blue', 'Retrieved session allowAnswerChange:', savedSession.allowAnswerChange);
    
    if (savedSession.allowAnswerChange === true) {
      log('green', '✓ allowAnswerChange correctly saved to database');
    } else {
      log('red', '✗ allowAnswerChange not saved correctly!');
      log('yellow', 'Session object:', JSON.stringify(savedSession.toObject(), null, 2));
    }

    // Clean up
    await Session.deleteOne({ _id: testSession._id });
    
    return savedSession.allowAnswerChange === true;
  } catch (error) {
    log('red', '✗ Error in session creation test:', error.message);
    return false;
  }
}

// Test 2: Check existing sessions for allowAnswerChange
async function checkExistingSessions() {
  log('cyan', '\n=== TEST 2: Existing Sessions Check ===');
  
  try {
    const sessions = await Session.find({})
      .sort({ createdAt: -1 })
      .limit(10);

    log('blue', `Found ${sessions.length} recent sessions`);

    sessions.forEach(session => {
      const hasField = 'allowAnswerChange' in session.toObject();
      const value = session.allowAnswerChange;
      
      log(hasField ? 'green' : 'red', 
        `Session ${session.sessionCode}:`,
        `allowAnswerChange = ${value} (field exists: ${hasField})`
      );
    });

    // Check sessions specifically with allowAnswerChange = true
    const sessionsWithAnswerChange = await Session.find({ allowAnswerChange: true });
    log('yellow', `\nSessions with allowAnswerChange = true: ${sessionsWithAnswerChange.length}`);
    
    sessionsWithAnswerChange.forEach(session => {
      log('green', `  - ${session.sessionCode} (${session.title})`);
    });

    return true;
  } catch (error) {
    log('red', '✗ Error checking existing sessions:', error.message);
    return false;
  }
}

// Test 3: Simulate API response flow
async function testAPIResponseFlow() {
  log('cyan', '\n=== TEST 3: API Response Flow ===');
  
  try {
    // Create a test session
    const testSession = await Session.create({
      sessionCode: `API${Date.now()}`,
      title: 'API Test Session',
      instructorId: new mongoose.Types.ObjectId(),
      allowAnswerChange: true,
      status: 'active',
      currentQuestion: {
        questionId: 'Q1',
        questionText: 'Test Question',
        questionType: 'multiple_choice',
        options: ['A', 'B', 'C', 'D'],
        startedAt: new Date()
      }
    });

    // Simulate the API response as it would be sent to client
    const apiResponse = {
      success: true,
      session: {
        id: testSession._id,
        sessionCode: testSession.sessionCode,
        title: testSession.title,
        status: testSession.status,
        currentQuestion: testSession.currentQuestion,
        participantCount: testSession.participants.length,
        responseCount: testSession.responses?.length || 0,
        totalQuestions: testSession.totalQuestions || 0,
        questionCount: testSession.questionsSent?.length || 0,
        requireLogin: testSession.requireLogin,
        restrictToEnrolled: testSession.restrictToEnrolled,
        allowAnswerChange: testSession.allowAnswerChange,
        classId: testSession.classId
      }
    };

    log('blue', 'API Response would include:', JSON.stringify(apiResponse.session, null, 2));
    
    if (apiResponse.session.allowAnswerChange === true) {
      log('green', '✓ allowAnswerChange correctly included in API response');
    } else {
      log('red', '✗ allowAnswerChange missing or incorrect in API response');
    }

    // Clean up
    await Session.deleteOne({ _id: testSession._id });
    
    return apiResponse.session.allowAnswerChange === true;
  } catch (error) {
    log('red', '✗ Error in API response test:', error.message);
    return false;
  }
}

// Test 4: Test answer submission flow
async function testAnswerSubmissionFlow() {
  log('cyan', '\n=== TEST 4: Answer Submission Flow ===');
  
  try {
    // Create a session with allowAnswerChange = true
    const testSession = await Session.create({
      sessionCode: `SUBMIT${Date.now()}`,
      title: 'Submission Test Session',
      instructorId: new mongoose.Types.ObjectId(),
      allowAnswerChange: true,
      status: 'active',
      currentQuestion: {
        questionId: 'Q1',
        questionText: 'Can you change your answer?',
        questionType: 'multiple_choice',
        options: ['Yes', 'No'],
        startedAt: new Date()
      },
      participants: [{
        participantId: 'P123',
        name: 'Test Student',
        joinedAt: new Date()
      }]
    });

    log('blue', 'Created session with allowAnswerChange:', testSession.allowAnswerChange);

    // Submit first answer
    const firstAnswer = 'A';
    testSession.responses.push({
      participantId: 'P123',
      questionId: 'Q1',
      answer: firstAnswer,
      submittedAt: new Date()
    });
    await testSession.save();
    log('green', '✓ First answer submitted:', firstAnswer);

    // Try to change answer
    const existingResponseIndex = testSession.responses.findIndex(r => 
      r.participantId === 'P123' && r.questionId === 'Q1'
    );

    if (existingResponseIndex !== -1) {
      log('yellow', 'Found existing response at index:', existingResponseIndex);
      
      if (testSession.allowAnswerChange) {
        // Update the answer
        const newAnswer = 'B';
        testSession.responses[existingResponseIndex].answer = newAnswer;
        testSession.responses[existingResponseIndex].submittedAt = new Date();
        await testSession.save();
        
        log('green', '✓ Answer changed successfully to:', newAnswer);
        
        // Verify the change
        const updatedSession = await Session.findById(testSession._id);
        const updatedResponse = updatedSession.responses.find(r => 
          r.participantId === 'P123' && r.questionId === 'Q1'
        );
        
        if (updatedResponse.answer === newAnswer) {
          log('green', '✓ Answer change verified in database');
        } else {
          log('red', '✗ Answer change not saved correctly');
        }
      } else {
        log('red', '✗ Answer change not allowed (allowAnswerChange = false)');
      }
    }

    // Clean up
    await Session.deleteOne({ _id: testSession._id });
    
    return true;
  } catch (error) {
    log('red', '✗ Error in submission flow test:', error.message);
    return false;
  }
}

// Test 5: Check specific session codes
async function checkSpecificSessions(sessionCodes) {
  log('cyan', '\n=== TEST 5: Specific Session Check ===');
  
  try {
    for (const code of sessionCodes) {
      const session = await Session.findOne({ sessionCode: code.toUpperCase() });
      
      if (session) {
        log('blue', `\nSession ${code}:`);
        log('yellow', '  Title:', session.title);
        log('yellow', '  Status:', session.status);
        log('yellow', '  allowAnswerChange:', session.allowAnswerChange);
        log('yellow', '  Participants:', session.participants.length);
        log('yellow', '  Responses:', session.responses.length);
        
        // Check if field exists in raw document
        const rawDoc = await Session.collection.findOne({ sessionCode: code.toUpperCase() });
        const fieldExists = 'allowAnswerChange' in rawDoc;
        log(fieldExists ? 'green' : 'red', '  Field exists in raw document:', fieldExists);
        
        if (!fieldExists) {
          log('yellow', '  Attempting to add field...');
          await Session.updateOne(
            { _id: session._id },
            { $set: { allowAnswerChange: false } }
          );
          log('green', '  ✓ Field added with default value (false)');
        }
      } else {
        log('red', `Session ${code} not found`);
      }
    }
    
    return true;
  } catch (error) {
    log('red', '✗ Error checking specific sessions:', error.message);
    return false;
  }
}

// Test 6: Monitor real-time session activity
async function monitorSessionActivity(sessionCode, duration = 30000) {
  log('cyan', `\n=== TEST 6: Monitoring Session ${sessionCode} ===`);
  
  try {
    const session = await Session.findOne({ sessionCode: sessionCode.toUpperCase() });
    
    if (!session) {
      log('red', 'Session not found');
      return false;
    }
    
    log('green', 'Session found:');
    log('yellow', '  allowAnswerChange:', session.allowAnswerChange);
    log('yellow', '  Current responses:', session.responses.length);
    
    log('blue', `\nMonitoring for ${duration/1000} seconds...`);
    log('yellow', 'Press Ctrl+C to stop monitoring\n');
    
    const startTime = Date.now();
    let lastResponseCount = session.responses.length;
    
    const interval = setInterval(async () => {
      try {
        const currentSession = await Session.findOne({ sessionCode: sessionCode.toUpperCase() });
        const currentResponseCount = currentSession.responses.length;
        
        if (currentResponseCount !== lastResponseCount) {
          log('green', `\n[${new Date().toISOString()}] New activity detected!`);
          log('yellow', `  Responses: ${lastResponseCount} → ${currentResponseCount}`);
          
          // Show recent responses
          const recentResponses = currentSession.responses.slice(-3);
          recentResponses.forEach(r => {
            log('blue', `  - Participant ${r.participantId} answered ${r.answer} for question ${r.questionId}`);
          });
          
          // Check for answer changes
          const responsesByParticipant = {};
          currentSession.responses.forEach(r => {
            const key = `${r.participantId}-${r.questionId}`;
            if (!responsesByParticipant[key]) {
              responsesByParticipant[key] = [];
            }
            responsesByParticipant[key].push(r);
          });
          
          Object.entries(responsesByParticipant).forEach(([key, responses]) => {
            if (responses.length > 1) {
              log('cyan', `  ! Multiple answers detected for ${key}:`, 
                responses.map(r => r.answer).join(' → '));
            }
          });
          
          lastResponseCount = currentResponseCount;
        }
        
        if (Date.now() - startTime >= duration) {
          clearInterval(interval);
          log('blue', '\nMonitoring complete');
        }
      } catch (error) {
        log('red', 'Error during monitoring:', error.message);
        clearInterval(interval);
      }
    }, 2000); // Check every 2 seconds
    
    // Wait for monitoring to complete
    await new Promise(resolve => setTimeout(resolve, duration));
    
    return true;
  } catch (error) {
    log('red', '✗ Error in monitoring:', error.message);
    return false;
  }
}

// Main debug function
async function runDebug() {
  log('bright', '\n=== INTELLACLICK ANSWER CHANGE DEBUG TOOL ===\n');
  
  // Connect to database
  if (!await connectDB()) {
    process.exit(1);
  }
  
  const tests = {
    'Session Creation': testSessionCreation,
    'Existing Sessions': checkExistingSessions,
    'API Response Flow': testAPIResponseFlow,
    'Answer Submission': testAnswerSubmissionFlow
  };
  
  const results = {};
  
  // Run all tests
  for (const [name, test] of Object.entries(tests)) {
    results[name] = await test();
  }
  
  // Check specific sessions if provided
  const args = process.argv.slice(2);
  if (args.length > 0) {
    if (args[0] === '--monitor' && args[1]) {
      await monitorSessionActivity(args[1], args[2] ? parseInt(args[2]) * 1000 : 30000);
    } else {
      await checkSpecificSessions(args);
    }
  }
  
  // Summary
  log('bright', '\n=== SUMMARY ===');
  Object.entries(results).forEach(([test, passed]) => {
    log(passed ? 'green' : 'red', `${test}: ${passed ? 'PASSED' : 'FAILED'}`);
  });
  
  // Recommendations
  log('bright', '\n=== RECOMMENDATIONS ===');
  log('yellow', '1. Check that the frontend is reading the allowAnswerChange field from API responses');
  log('yellow', '2. Verify that the answer submission logic checks allowAnswerChange before rejecting duplicates');
  log('yellow', '3. Use --monitor flag to watch a live session: node debug-answer-change.js --monitor SESSION_CODE [seconds]');
  log('yellow', '4. Check specific sessions: node debug-answer-change.js SESSION_CODE1 SESSION_CODE2 ...');
  
  // Close database connection
  await mongoose.connection.close();
  log('green', '\n✓ Database connection closed');
}

// Run the debug script
runDebug().catch(error => {
  log('red', 'Fatal error:', error);
  process.exit(1);
});
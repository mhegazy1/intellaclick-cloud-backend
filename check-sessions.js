// Script to check for duplicate sessions and see which ones have questions/responses
const mongoose = require('mongoose');
const Session = require('./models/Session');
require('dotenv').config();

async function checkSessions() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/intellaclick');
    
    console.log('Connected to MongoDB');
    
    // Find all sessions grouped by code
    const sessions = await Session.find({}).sort({ sessionCode: 1, createdAt: -1 });
    
    const sessionsByCode = {};
    sessions.forEach(session => {
      if (!sessionsByCode[session.sessionCode]) {
        sessionsByCode[session.sessionCode] = [];
      }
      sessionsByCode[session.sessionCode].push(session);
    });
    
    console.log('\n=== SESSIONS BY CODE ===');
    Object.entries(sessionsByCode).forEach(([code, sessions]) => {
      if (sessions.length > 1) {
        console.log(`\nCODE: ${code} - ${sessions.length} DUPLICATE SESSIONS!`);
      } else {
        console.log(`\nCODE: ${code}`);
      }
      
      sessions.forEach((session, idx) => {
        console.log(`  Session ${idx + 1}:`);
        console.log(`    ID: ${session._id}`);
        console.log(`    Status: ${session.status}`);
        console.log(`    Created: ${session.createdAt}`);
        console.log(`    Participants: ${session.participants?.length || 0}`);
        console.log(`    Responses: ${session.responses?.length || 0}`);
        console.log(`    Current Question: ${session.currentQuestion?.questionText ? 'YES' : 'NO'}`);
        if (session.currentQuestion?.questionText) {
          console.log(`      Question: "${session.currentQuestion.questionText.substring(0, 50)}..."`);
        }
      });
    });
    
    // Check for sessions with many responses
    console.log('\n=== SESSIONS WITH MANY RESPONSES ===');
    sessions.filter(s => s.responses?.length > 10).forEach(session => {
      console.log(`Code: ${session.sessionCode}, Responses: ${session.responses.length}, Status: ${session.status}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkSessions();
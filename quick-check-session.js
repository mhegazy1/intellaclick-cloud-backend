// Quick session checker with hardcoded MongoDB URI
const mongoose = require('mongoose');
const Session = require('./models/Session');

const MONGODB_URI = 'mongodb+srv://intellaquizuser:dV7hRN41DDX8ynru@intellaquiz.k1zwci5.mongodb.net/intellaquiz?retryWrites=true&w=majority&appName=intellaquiz';

async function checkSession(sessionCode) {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected!\n');

    const session = await Session.findOne({ sessionCode: sessionCode.toUpperCase() });
    
    if (!session) {
      console.log(`Session ${sessionCode} not found`);
    } else {
      console.log(`Session Found: ${session.sessionCode}`);
      console.log(`Title: ${session.title}`);
      console.log(`Status: ${session.status}`);
      console.log(`Allow Answer Change: ${session.allowAnswerChange}`);
      console.log(`Require Login: ${session.requireLogin}`);
      console.log(`Restrict to Enrolled: ${session.restrictToEnrolled}`);
      console.log(`Created: ${session.createdAt}`);
      console.log(`Responses: ${session.responses.length}`);
      
      if (session.allowAnswerChange === undefined || session.allowAnswerChange === null) {
        console.log('\nWARNING: allowAnswerChange is not set!');
      }
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

const sessionCode = process.argv[2] || 'GL30Z8';
console.log(`Checking session: ${sessionCode}\n`);
checkSession(sessionCode);
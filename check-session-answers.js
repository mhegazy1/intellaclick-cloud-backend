const mongoose = require('mongoose');
require('dotenv').config();

async function checkSession() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const Session = require('./models/Session');

    // Find the session with code 0RFB15
    const session = await Session.findOne({ sessionCode: '0RFB15' });

    if (!session) {
      console.log('Session not found');
      process.exit(0);
    }

    console.log('Session Code:', session.sessionCode);
    console.log('Session Title:', session.title);
    console.log('Total Responses:', session.responses?.length || 0);
    console.log('\nSample Responses:');

    // Check first 10 responses
    (session.responses || []).slice(0, 10).forEach((r, i) => {
      console.log(`Response ${i+1}:`);
      console.log('  questionId:', r.questionId);
      console.log('  participantId:', r.participantId);
      console.log('  answer:', r.answer);
      console.log('  answer type:', typeof r.answer);
      console.log('  answer === null:', r.answer === null);
      console.log('  answer === undefined:', r.answer === undefined);
      console.log('  submittedAt:', r.submittedAt);
      console.log('');
    });

    console.log('\nChecking responses with null answers:');
    const nullAnswers = (session.responses || []).filter(r => r.answer === null || r.answer === undefined);
    console.log('Total responses with null/undefined answers:', nullAnswers.length);

    if (nullAnswers.length > 0) {
      console.log('\nFirst null answer example:');
      const firstNull = nullAnswers[0];
      console.log('  Full response object:', JSON.stringify(firstNull, null, 2));
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkSession();

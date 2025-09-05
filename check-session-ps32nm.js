// Script to check session PS32NM and its requireLogin field
const mongoose = require('mongoose');
const Session = require('./models/Session');
require('dotenv').config();

async function checkSessionPS32NM() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/intellaclick');
    
    console.log('Connected to MongoDB');
    console.log('Looking for session PS32NM...\n');
    
    // Find all sessions with code PS32NM
    const sessions = await Session.find({ sessionCode: 'PS32NM' });
    
    if (sessions.length === 0) {
      console.log('❌ No session found with code PS32NM');
    } else {
      console.log(`✅ Found ${sessions.length} session(s) with code PS32NM:\n`);
      
      sessions.forEach((session, idx) => {
        console.log(`Session ${idx + 1}:`);
        console.log(`  ID: ${session._id}`);
        console.log(`  Session Code: ${session.sessionCode}`);
        console.log(`  Title: ${session.title}`);
        console.log(`  requireLogin: ${session.requireLogin}`);
        console.log(`  Status: ${session.status}`);
        console.log(`  Created: ${session.createdAt}`);
        console.log(`  Updated: ${session.updatedAt}`);
        console.log(`  Instructor ID: ${session.instructorId}`);
        console.log(`  Participants: ${session.participants?.length || 0}`);
        console.log(`  Responses: ${session.responses?.length || 0}`);
        console.log(`  Questions Sent: ${session.questionsSent?.length || 0}`);
        console.log(`  Total Questions: ${session.totalQuestions}`);
        
        if (session.participants?.length > 0) {
          console.log('\n  Participants:');
          session.participants.forEach((p, pIdx) => {
            console.log(`    ${pIdx + 1}. Name: ${p.name}, ID: ${p.participantId}, UserID: ${p.userId || 'N/A'}`);
          });
        }
        
        console.log('\n' + '-'.repeat(50) + '\n');
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

checkSessionPS32NM();
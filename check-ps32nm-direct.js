// Script to check session PS32NM using direct MongoDB connection
const mongoose = require('mongoose');
const Session = require('./models/Session');
require('dotenv').config();

async function checkSessionPS32NM() {
  try {
    console.log('Attempting to connect to MongoDB...');
    console.log('Using connection string:', process.env.MONGODB_URI?.substring(0, 50) + '...');
    
    // Try different connection options to work around DNS issues
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      family: 4 // Force IPv4
    };
    
    try {
      await mongoose.connect(process.env.MONGODB_URI, options);
      console.log('Connected to MongoDB successfully!');
    } catch (connectError) {
      console.error('Connection failed with error:', connectError.message);
      
      // Try alternative connection string format
      const altUri = process.env.MONGODB_URI.replace('mongodb+srv://', 'mongodb://');
      console.log('\nTrying alternative connection format...');
      
      try {
        await mongoose.connect(altUri, options);
        console.log('Connected with alternative format!');
      } catch (altError) {
        console.error('Alternative connection also failed:', altError.message);
        throw altError;
      }
    }
    
    console.log('\nSearching for session PS32NM...');
    
    // Find all sessions with code PS32NM
    const sessions = await Session.find({ sessionCode: 'PS32NM' }).lean();
    
    if (sessions.length === 0) {
      console.log('\n❌ No session found with code PS32NM');
    } else {
      console.log(`\n✅ Found ${sessions.length} session(s) with code PS32NM:\n`);
      
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
        
        if (session.requireLogin === undefined) {
          console.log(`  ⚠️  WARNING: requireLogin field is undefined!`);
        }
        
        console.log('\n' + '-'.repeat(50) + '\n');
      });
    }
    
  } catch (error) {
    console.error('\nError occurred:', error.message);
    console.error('Error type:', error.name);
    
    if (error.message.includes('ENOTFOUND')) {
      console.error('\n⚠️  DNS resolution failed. This is a common issue in WSL environments.');
      console.error('Possible solutions:');
      console.error('1. Check your internet connection');
      console.error('2. Try running: sudo service systemd-resolved restart');
      console.error('3. Check /etc/resolv.conf for proper DNS servers');
      console.error('4. Try using a VPN or different network');
    }
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log('\nDisconnected from MongoDB');
    }
  }
}

checkSessionPS32NM();
const mongoose = require('mongoose');
const Session = require('./models/Session');
require('dotenv').config();

async function checkAndFixSession(sessionCode) {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/intellaclick');
        console.log('Connected to MongoDB');
        
        // Find the session
        const session = await Session.findOne({ sessionCode: sessionCode.toUpperCase() });
        
        if (!session) {
            console.log('Session not found');
            return;
        }
        
        console.log('\nCurrent session data:');
        console.log('- Title:', session.title);
        console.log('- Code:', session.sessionCode);
        console.log('- Status:', session.status);
        console.log('- RequireLogin:', session.requireLogin);
        console.log('- Created:', session.createdAt);
        
        // Check if requireLogin is undefined
        if (session.requireLogin === undefined) {
            console.log('\n⚠️  requireLogin is undefined!');
            
            // Ask if we should fix it
            if (process.argv[3] === 'fix') {
                session.requireLogin = true;
                await session.save();
                console.log('✅ Updated requireLogin to true');
                
                // Verify the fix
                const updated = await Session.findOne({ sessionCode: sessionCode.toUpperCase() });
                console.log('Verification - requireLogin is now:', updated.requireLogin);
            } else {
                console.log('To fix this, run: node fix-session-requirelogin.js', sessionCode, 'fix');
            }
        } else {
            console.log('\n✅ requireLogin is properly set to:', session.requireLogin);
        }
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB');
    }
}

// Usage
const sessionCode = process.argv[2];
if (!sessionCode) {
    console.log('Usage: node fix-session-requirelogin.js SESSION_CODE [fix]');
    console.log('Example: node fix-session-requirelogin.js BK3235');
    console.log('To fix: node fix-session-requirelogin.js BK3235 fix');
} else {
    checkAndFixSession(sessionCode);
}
const axios = require('axios');

// Configuration
const API_URL = 'https://api.intellaclick.com/api';
const TOKEN = process.env.INTELLACLICK_TOKEN || 'your-auth-token-here';

console.log('Timer Update Test Script');
console.log('=======================');
console.log('API URL:', API_URL);
console.log('Token:', TOKEN ? TOKEN.substring(0, 20) + '...' : 'NOT SET');

async function testTimerUpdate() {
  try {
    // Step 1: Get active sessions
    console.log('\n1. Getting your sessions...');
    const sessionsResponse = await axios.get(`${API_URL}/sessions`, {
      headers: { 'x-auth-token': TOKEN }
    });
    
    if (!sessionsResponse.data.success) {
      console.error('Failed to get sessions:', sessionsResponse.data.error);
      return;
    }
    
    const activeSessions = sessionsResponse.data.sessions.filter(s => s.status === 'active');
    console.log(`Found ${activeSessions.length} active sessions`);
    
    if (activeSessions.length === 0) {
      console.log('No active sessions found. Please start a session first.');
      return;
    }
    
    // Use the first active session
    const session = activeSessions[0];
    console.log(`Using session: ${session.sessionCode} (ID: ${session._id})`);
    
    // Step 2: Get current question
    console.log('\n2. Getting current question...');
    const sessionDetailsResponse = await axios.get(`${API_URL}/sessions/code/${session.sessionCode}`);
    
    if (!sessionDetailsResponse.data.session.currentQuestion) {
      console.log('No active question. Please send a question first.');
      return;
    }
    
    const currentQuestion = sessionDetailsResponse.data.session.currentQuestion;
    console.log('Current question:', {
      id: currentQuestion.id || currentQuestion._id || 'unknown',
      text: currentQuestion.questionText?.substring(0, 50) + '...',
      currentTimeLimit: currentQuestion.timeLimit
    });
    
    // Step 3: Test timer update
    console.log('\n3. Testing timer update (+15 seconds)...');
    const updateResponse = await axios.post(
      `${API_URL}/sessions/${session._id}/questions/${currentQuestion.id || currentQuestion._id || 'current'}/timer`,
      { addSeconds: 15 },
      { headers: { 'x-auth-token': TOKEN } }
    );
    
    if (updateResponse.data.success) {
      console.log('✅ Timer update successful!');
      console.log('New time limit:', updateResponse.data.newTimeLimit);
      
      // Step 4: Verify the update
      console.log('\n4. Verifying the update...');
      const verifyResponse = await axios.get(`${API_URL}/sessions/code/${session.sessionCode}`);
      const updatedQuestion = verifyResponse.data.session.currentQuestion;
      
      console.log('Verified time limit:', updatedQuestion.timeLimit);
      console.log('Update confirmed:', updatedQuestion.timeLimit === updateResponse.data.newTimeLimit ? '✅' : '❌');
      
      // Step 5: Test what students would see
      console.log('\n5. Testing student view...');
      const studentResponse = await axios.get(`${API_URL}/sessions/code/${session.sessionCode}/current-question`);
      
      if (studentResponse.data.success && studentResponse.data.question) {
        console.log('Student would see time limit:', studentResponse.data.question.timeLimit);
      }
      
    } else {
      console.error('❌ Timer update failed:', updateResponse.data);
    }
    
  } catch (error) {
    console.error('\n❌ Error during test:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Message:', error.message);
    }
  }
}

// Instructions
console.log('\nTo run this test:');
console.log('1. Set your auth token: export INTELLACLICK_TOKEN="your-token"');
console.log('2. Make sure you have an active session with a live question');
console.log('3. Run: node test-timer-update.js');
console.log('\nStarting test in 3 seconds...\n');

setTimeout(testTimerUpdate, 3000);
const axios = require('axios');

// Simple timer test using session code
const SESSION_CODE = process.argv[2] || 'G58045';  // Pass code as argument or use default
const API_URL = 'https://api.intellaclick.com/api';

console.log('Simple Timer Test');
console.log('=================');
console.log('Session Code:', SESSION_CODE);
console.log('');

async function checkTimer() {
  try {
    // Get current question
    console.log('Fetching current question...');
    const response = await axios.get(`${API_URL}/sessions/code/${SESSION_CODE}/current-question`);
    
    if (response.data.success && response.data.question) {
      const question = response.data.question;
      console.log('\nCurrent Question:');
      console.log('- Text:', question.questionText?.substring(0, 50) + '...');
      console.log('- Time Limit:', question.timeLimit, 'seconds');
      console.log('- Question ID:', question.id || question._id);
      
      // Get full session details
      const sessionResponse = await axios.get(`${API_URL}/sessions/code/${SESSION_CODE}`);
      if (sessionResponse.data.success) {
        const session = sessionResponse.data.session;
        console.log('\nSession Details:');
        console.log('- Session ID:', session.id);
        console.log('- Participants:', session.participantCount);
        console.log('- Responses:', session.responseCount);
        
        console.log('\n📍 To test timer update manually:');
        console.log('1. Click the +15s button in PowerPoint');
        console.log('2. Run this script again to see if timeLimit changed');
        console.log('3. Or check the student portal to see if timer updated');
      }
    } else {
      console.log('No active question found.');
      console.log('Make sure you have sent a question from PowerPoint.');
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

// Run check
checkTimer();

// Optional: Watch for changes
if (process.argv[3] === '--watch') {
  console.log('\nWatching for changes (press Ctrl+C to stop)...');
  setInterval(async () => {
    console.log('\n--- Checking at', new Date().toLocaleTimeString(), '---');
    await checkTimer();
  }, 5000);
}
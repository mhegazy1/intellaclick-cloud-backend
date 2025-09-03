// Test script to debug response flow
const axios = require('axios');

async function testResponseFlow(sessionCode) {
  const baseURL = 'https://api.intellaclick.com/api';
  
  console.log('=== TESTING RESPONSE FLOW ===');
  console.log('Session Code:', sessionCode);
  console.log('');
  
  try {
    // 1. Check if session exists
    console.log('1. Checking if session exists...');
    const sessionResponse = await axios.get(`${baseURL}/sessions/code/${sessionCode}`);
    console.log('Session found:', {
      id: sessionResponse.data.session.id,
      status: sessionResponse.data.session.status,
      participantCount: sessionResponse.data.session.participantCount
    });
    console.log('');
    
    // 2. Get current question
    console.log('2. Getting current question...');
    const questionResponse = await axios.get(`${baseURL}/sessions/code/${sessionCode}/current-question`);
    console.log('Current question:', questionResponse.data.question ? {
      id: questionResponse.data.question.id,
      text: questionResponse.data.question.questionText?.substring(0, 50) + '...'
    } : 'No current question');
    console.log('');
    
    // 3. Get responses
    console.log('3. Getting responses...');
    const responsesResponse = await axios.get(`${baseURL}/sessions/code/${sessionCode}/responses`);
    console.log('Responses:', {
      totalResponses: responsesResponse.data.totalResponses,
      responseCount: responsesResponse.data.responses?.length,
      byQuestion: Object.keys(responsesResponse.data.responsesByQuestion || {}).map(q => ({
        questionId: q,
        count: responsesResponse.data.responsesByQuestion[q].length
      }))
    });
    
    // 4. Submit a test response
    if (questionResponse.data.question) {
      console.log('');
      console.log('4. Submitting test response...');
      const testResponse = await axios.post(`${baseURL}/sessions/code/${sessionCode}/respond`, {
        questionId: questionResponse.data.question.id,
        answer: 'A',
        participantId: `test_${Date.now()}`
      });
      console.log('Response submitted:', testResponse.data);
      
      // 5. Check responses again
      console.log('');
      console.log('5. Getting responses after submission...');
      const afterResponse = await axios.get(`${baseURL}/sessions/code/${sessionCode}/responses`);
      console.log('Responses after submission:', {
        totalResponses: afterResponse.data.totalResponses,
        newCount: afterResponse.data.totalResponses - responsesResponse.data.totalResponses
      });
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

// Get session code from command line
const sessionCode = process.argv[2];
if (!sessionCode) {
  console.log('Usage: node test-responses-flow.js SESSION_CODE');
  process.exit(1);
}

testResponseFlow(sessionCode);
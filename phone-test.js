// Phone/Other Device Test Script
// Copy and paste this entire script into the browser console

console.clear();
console.log('🔍 IntellaQuiz Debug Test');

const sessionCode = 'QR655X';
const devSessionId = '68b66e165f8b4555934eca42';

console.log('Testing session:', sessionCode);
console.log('Dev computer session ID:', devSessionId);
console.log('----------------------------');

// Test 1: Check session
fetch('https://api.intellaclick.com/api/sessions/code/' + sessionCode)
  .then(r => r.json())
  .then(data => {
    const thisSessionId = data.session?.id;
    console.log('This device session ID:', thisSessionId);
    
    if (thisSessionId === devSessionId) {
      console.log('✅ SAME SESSION - IDs match!');
    } else {
      console.log('❌ DIFFERENT SESSIONS!');
      console.log('This is THE PROBLEM - devices connecting to different sessions!');
    }
    
    console.log('Has current question:', !!data.session?.currentQuestion);
    if (data.session?.currentQuestion) {
      console.log('Question:', data.session.currentQuestion.questionText);
    }
  });

// Test 2: Check current question endpoint
setTimeout(() => {
  console.log('\nChecking current question endpoint...');
  fetch('https://api.intellaclick.com/api/sessions/code/' + sessionCode + '/current-question?t=' + Date.now())
    .then(r => {
      console.log('Cache status:', r.headers.get('cf-cache-status') || 'No CloudFlare header');
      return r.json();
    })
    .then(data => {
      if (data.question) {
        console.log('✅ Question found:', data.question.questionText);
      } else {
        console.log('❌ No question on this endpoint');
      }
    });
}, 1000);

// Test 3: Monitor for 15 seconds
console.log('\nStarting 15-second monitor...');
let checkCount = 0;
const monitor = setInterval(() => {
  checkCount++;
  fetch('https://api.intellaclick.com/api/sessions/code/' + sessionCode + '/current-question?t=' + Date.now())
    .then(r => r.json())
    .then(data => {
      const hasQ = !!data.question;
      console.log(`Check ${checkCount}: ${hasQ ? '✅ Question present' : '❌ No question'}`);
      if (checkCount >= 5) {
        clearInterval(monitor);
        console.log('\nMonitor complete. If no questions appeared, check session ID match above.');
      }
    });
}, 3000);
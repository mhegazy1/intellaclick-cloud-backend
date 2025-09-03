// Quick Join Fix for IntellaQuiz Student Portal
console.clear();
console.log('%c🚀 Quick Join Fix', 'color: blue; font-size: 16px');

const sessionCode = prompt('Enter session code:') || 'QR655X';
const participantName = prompt('Enter your name:') || 'Test Student';

console.log('Joining session:', sessionCode);
console.log('As:', participantName);

// Step 1: Join the session via API
fetch('https://api.intellaclick.com/api/sessions/join', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionCode: sessionCode.toUpperCase(),
    name: participantName
  })
})
.then(r => r.json())
.then(data => {
  if (data.success) {
    console.log('✅ Joined successfully!');
    console.log('Participant ID:', data.participantId);
    
    // Step 2: Store necessary data in localStorage
    localStorage.setItem('participantId', data.participantId);
    localStorage.setItem('currentSession', JSON.stringify(data.session));
    localStorage.setItem('intellaquiz_participant_name', participantName);
    
    // Store in the format the app expects
    const sessionData = {
      session: data.session,
      participant: {
        id: data.participantId,
        name: participantName,
        joinedAt: new Date().toISOString()
      }
    };
    
    localStorage.setItem('intellaquiz_session_' + sessionCode.toUpperCase(), JSON.stringify(sessionData));
    localStorage.setItem('intellaquiz_last_session', JSON.stringify({
      code: sessionCode.toUpperCase(),
      name: participantName,
      timestamp: Date.now()
    }));
    
    // Step 3: Navigate to session page
    console.log('Redirecting to session page...');
    window.location.href = `/session/${sessionCode.toUpperCase()}`;
    
  } else {
    console.error('❌ Join failed:', data.error);
  }
})
.catch(err => {
  console.error('❌ Network error:', err);
});

console.log('\nIf this doesn\'t work, try the manual steps:');
console.log('1. Go to https://join.intellaclick.com');
console.log('2. Click "Join Session"');
console.log('3. Enter code:', sessionCode);
console.log('4. Enter your name');
console.log('5. Click "Join"');
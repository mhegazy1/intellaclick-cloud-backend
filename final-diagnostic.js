// Final Diagnostic - Find the exact break point
console.clear();
console.log('%c🔬 Final Diagnostic', 'color: red; font-size: 20px');

const sessionCode = window.location.pathname.split('/session/')[1] || prompt('Session code:');

// Step 1: Check if API returns question
console.log('\n1️⃣ Checking API directly...');
fetch(`https://api.intellaclick.com/api/sessions/code/${sessionCode}/current-question?t=${Date.now()}`)
  .then(r => r.json())
  .then(data => {
    if (data.question) {
      console.log('✅ API HAS QUESTION:', data.question.questionText);
      console.log('   Question ID:', data.question.id);
    } else {
      console.log('❌ API has NO question');
    }
  });

// Step 2: Check localStorage/sessionStorage
console.log('\n2️⃣ Checking storage...');
console.log('localStorage participantId:', localStorage.getItem('participantId'));
console.log('localStorage currentSession:', localStorage.getItem('currentSession'));
console.log('sessionStorage currentSession:', sessionStorage.getItem('currentSession'));

// Step 3: Try to access the connection service
console.log('\n3️⃣ Looking for connection service...');

// Method 1: Check window object
if (window.connectionService || window.unifiedService) {
  console.log('✅ Found on window:', window.connectionService || window.unifiedService);
}

// Method 2: Check React context through console hack
const checkReactContext = () => {
  // This is a hack to access React internals
  const root = document.getElementById('root');
  if (!root) return;
  
  const reactKey = Object.keys(root).find(key => key.startsWith('__reactFiber'));
  if (!reactKey) {
    console.log('❌ No React fiber found');
    return;
  }
  
  let fiber = root[reactKey];
  let found = false;
  
  // Walk up the tree looking for UnifiedSessionContext
  while (fiber && !found) {
    if (fiber.memoizedState && fiber.elementType) {
      const name = fiber.elementType.name || '';
      if (name.includes('UnifiedSessionProvider') || name.includes('SessionContext')) {
        console.log('✅ Found context provider:', name);
        console.log('   State:', fiber.memoizedState);
        
        // Try to access the connection ref
        if (fiber.memoizedState?.baseState) {
          console.log('   Base state:', fiber.memoizedState.baseState);
        }
        found = true;
      }
    }
    fiber = fiber.return;
  }
  
  if (!found) {
    console.log('❌ Context provider not found in React tree');
  }
};

setTimeout(checkReactContext, 1000);

// Step 4: Monitor actual network requests
console.log('\n4️⃣ Monitoring network for 10 seconds...');
let pollCount = 0;
let lastQuestionId = null;

const monitorNetwork = setInterval(() => {
  // Check performance API for recent requests
  const entries = performance.getEntriesByType('resource');
  const questionPolls = entries.filter(e => 
    e.name.includes('current-question') && 
    e.startTime > performance.now() - 3500
  );
  
  if (questionPolls.length > 0) {
    pollCount++;
    console.log(`Poll #${pollCount}: Found ${questionPolls.length} question request(s)`);
    
    // Fetch the latest to see response
    const latestUrl = questionPolls[questionPolls.length - 1].name;
    fetch(latestUrl)
      .then(r => r.json())
      .then(data => {
        if (data.question) {
          if (data.question.id !== lastQuestionId) {
            console.log(`   🆕 NEW QUESTION: ${data.question.questionText}`);
            lastQuestionId = data.question.id;
          } else {
            console.log(`   ♻️ Same question (${data.question.id})`);
          }
        } else {
          console.log('   ⏸️ No question');
        }
      });
  }
  
  if (pollCount >= 3) {
    clearInterval(monitorNetwork);
    console.log('\n📊 SUMMARY:');
    if (pollCount > 0) {
      console.log('✅ Polling IS happening');
      console.log('❌ But React UI not updating');
      console.log('\n🔧 SOLUTION: The connection service is not triggering React re-renders');
      console.log('   Try: Refresh the page with Ctrl+Shift+R');
    } else {
      console.log('❌ No polling detected');
      console.log('❌ Connection service not running');
      console.log('\n🔧 SOLUTION: Connection was never established');
      console.log('   Try: Go back to /join and rejoin the session');
    }
  }
}, 3000);

// Step 5: Try to trigger a manual update
console.log('\n5️⃣ Creating manual trigger...');
window.forceQuestionUpdate = async () => {
  const response = await fetch(`https://api.intellaclick.com/api/sessions/code/${sessionCode}/current-question?t=${Date.now()}`);
  const data = await response.json();
  
  if (data.question) {
    console.log('Attempting to force update with:', data.question.questionText);
    
    // Try multiple methods
    // Method 1: Dispatch event
    window.dispatchEvent(new CustomEvent('intellaquiz:forceUpdate', { detail: data.question }));
    
    // Method 2: Direct localStorage update
    const session = JSON.parse(localStorage.getItem('currentSession') || '{}');
    session.currentQuestion = data.question;
    localStorage.setItem('currentSession', JSON.stringify(session));
    
    // Method 3: Force reload
    console.log('If question still doesn\'t appear, the React app needs a full reload');
    console.log('Run: window.location.reload()');
  } else {
    console.log('No question available to force update');
  }
};

console.log('\n💡 Run window.forceQuestionUpdate() to attempt manual update');
console.log('📱 Or just refresh the page with Ctrl+Shift+R');
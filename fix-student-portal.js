// Student Portal State Debug & Fix
console.clear();
console.log('%c🔧 Student Portal Fix Attempt', 'color: blue; font-size: 16px');

// 1. Check current URL and state
console.log('\n1️⃣ Current state:');
console.log('URL:', window.location.href);
console.log('Path:', window.location.pathname);

// 2. Look for the session join flow
console.log('\n2️⃣ Checking React Router...');
const isInSession = window.location.pathname.includes('/session/');
console.log('In session view?', isInSession);

// 3. Try to trigger the join flow
if (!isInSession) {
  console.log('\n3️⃣ Not in session view. Redirecting...');
  const sessionCode = prompt('Enter session code:') || 'QR655X';
  window.location.href = `/session/${sessionCode}`;
} else {
  console.log('\n3️⃣ Already in session view. Checking state...');
  
  // 4. Force session data into localStorage
  const sessionCode = window.location.pathname.split('/session/')[1];
  console.log('Session code from URL:', sessionCode);
  
  if (!localStorage.getItem('currentSession')) {
    console.log('\n4️⃣ No session in localStorage. Fetching and storing...');
    
    fetch(`https://api.intellaclick.com/api/sessions/code/${sessionCode}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          // Store session
          localStorage.setItem('currentSession', JSON.stringify(data.session));
          console.log('✅ Session stored in localStorage');
          
          // Try to join
          return fetch('https://api.intellaclick.com/api/sessions/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionCode: sessionCode,
              name: 'Student ' + Math.floor(Math.random() * 1000)
            })
          });
        }
      })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          localStorage.setItem('participantId', data.participantId);
          console.log('✅ Joined session, participant ID:', data.participantId);
          console.log('\n⚠️ RELOADING PAGE to reinitialize React app...');
          setTimeout(() => window.location.reload(), 1000);
        }
      });
  } else {
    console.log('\n4️⃣ Session already in localStorage. Checking React state...');
    
    // 5. Try to find React fiber
    console.log('\n5️⃣ Looking for React internals...');
    
    const findReactFiber = (dom) => {
      const key = Object.keys(dom).find(key => key.startsWith('__reactFiber$'));
      return dom[key];
    };
    
    const root = document.getElementById('root');
    if (root) {
      const fiber = findReactFiber(root);
      if (fiber) {
        console.log('React fiber found');
        
        // Walk up to find component with state
        let current = fiber;
        while (current) {
          if (current.memoizedState) {
            console.log('Component with state:', current.elementType?.name || current.type?.name);
            console.log('State:', current.memoizedState);
          }
          current = current.return;
        }
      }
    }
    
    // 6. Check network polling
    console.log('\n6️⃣ Checking if polling is active...');
    let pollCount = 0;
    console.log('Monitoring network for 10 seconds...');
    
    const checkNetwork = () => {
      const entries = performance.getEntriesByType('resource');
      const apiCalls = entries.filter(e => e.name.includes('api.intellaclick.com'));
      const recentCalls = apiCalls.filter(e => e.startTime > performance.now() - 5000);
      
      console.log(`Poll check ${++pollCount}: ${recentCalls.length} recent API calls`);
      
      if (pollCount < 5) {
        setTimeout(checkNetwork, 2000);
      } else {
        console.log('\n❌ No polling detected. The app is not fetching questions!');
        console.log('🔄 Try refreshing the page or rejoining the session.');
      }
    };
    
    checkNetwork();
  }
}

// 7. Nuclear option - inject our own polling
console.log('\n7️⃣ Injecting question display fallback...');

const injectQuestionDisplay = () => {
  // Remove any existing inject
  const existing = document.getElementById('intellaquiz-inject');
  if (existing) existing.remove();
  
  // Create container
  const container = document.createElement('div');
  container.id = 'intellaquiz-inject';
  container.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: white;
    border: 2px solid #007bff;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    z-index: 9999;
    max-width: 600px;
    width: 90%;
  `;
  
  container.innerHTML = `
    <h3 style="margin: 0 0 10px 0; color: #007bff;">IntellaQuiz Question</h3>
    <div id="iq-question-text" style="font-size: 18px; margin-bottom: 15px;">Loading...</div>
    <div id="iq-options"></div>
    <button onclick="document.getElementById('intellaquiz-inject').remove()" 
            style="position: absolute; top: 10px; right: 10px; border: none; background: none; font-size: 20px; cursor: pointer;">×</button>
  `;
  
  document.body.appendChild(container);
  
  // Start polling
  const sessionCode = window.location.pathname.split('/session/')[1] || prompt('Session code:');
  
  const pollQuestion = () => {
    fetch(`https://api.intellaclick.com/api/sessions/code/${sessionCode}/current-question?t=${Date.now()}`)
      .then(r => r.json())
      .then(data => {
        const textEl = document.getElementById('iq-question-text');
        const optionsEl = document.getElementById('iq-options');
        
        if (data.question) {
          textEl.textContent = data.question.questionText;
          
          if (data.question.options && data.question.options.length > 0) {
            optionsEl.innerHTML = data.question.options.map((opt, i) => `
              <button style="display: block; width: 100%; padding: 10px; margin: 5px 0; 
                           background: #f0f0f0; border: 1px solid #ddd; border-radius: 4px; 
                           cursor: pointer; text-align: left;"
                      onclick="alert('Selected: ${opt.text || opt}')">
                ${opt.text || opt}
              </button>
            `).join('');
          }
        } else {
          textEl.textContent = 'Waiting for question...';
          optionsEl.innerHTML = '';
        }
      })
      .catch(err => {
        document.getElementById('iq-question-text').textContent = 'Error: ' + err.message;
      });
  };
  
  pollQuestion();
  setInterval(pollQuestion, 3000);
  
  console.log('✅ Fallback question display injected!');
};

// Auto-inject after 2 seconds
setTimeout(injectQuestionDisplay, 2000);
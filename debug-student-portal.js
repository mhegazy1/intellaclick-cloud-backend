// Student Portal Debug Script
// Run this in the browser console while on join.intellaclick.com

console.clear();
console.log('%c🔍 Student Portal Debug', 'color: blue; font-size: 16px');

// Check what's in the window/global scope
console.log('\n1️⃣ Checking global objects...');
console.log('Window has connectionService?', !!window.connectionService);
console.log('Window has unifiedService?', !!window.unifiedService);
console.log('Window has socket?', !!window.socket);

// Check localStorage
console.log('\n2️⃣ Checking localStorage...');
const sessionData = localStorage.getItem('currentSession');
const participantId = localStorage.getItem('participantId');
console.log('Current session:', sessionData ? JSON.parse(sessionData) : 'None');
console.log('Participant ID:', participantId);

// Check React DevTools
console.log('\n3️⃣ Looking for React components...');
const hasReact = !!window.React || !!document.querySelector('[data-reactroot]') || !!document.querySelector('div#root');
console.log('React detected:', hasReact);

// Check network activity
console.log('\n4️⃣ Monitoring network requests...');
console.log('Open Network tab (F12) and look for:');
console.log('- Requests to /current-question');
console.log('- Socket.io connections');
console.log('- Any 404 or error responses');

// Try to manually fetch and display
console.log('\n5️⃣ Manual question fetch...');
const sessionCode = prompt('Enter session code:') || 'QR655X';

fetch(`https://api.intellaclick.com/api/sessions/code/${sessionCode}/current-question?t=${Date.now()}`)
  .then(r => r.json())
  .then(data => {
    if (data.question) {
      console.log('✅ Question fetched successfully:');
      console.log(data.question);
      
      // Try to inject it into the page
      console.log('\n6️⃣ Attempting to display question...');
      
      // Look for question container
      const containers = [
        document.querySelector('.question-display'),
        document.querySelector('.question-container'),
        document.querySelector('.current-question'),
        document.querySelector('[class*="question"]'),
        document.querySelector('.container'),
        document.querySelector('main'),
        document.querySelector('#root')
      ];
      
      const container = containers.find(c => c !== null);
      if (container) {
        console.log('Found container:', container.className || container.id);
        
        // Check if it's hidden
        const computed = window.getComputedStyle(container);
        console.log('Container visible?', computed.display !== 'none' && computed.visibility !== 'hidden');
        
        // Try to inject question
        const questionDiv = document.createElement('div');
        questionDiv.style.cssText = 'border: 2px solid red; padding: 20px; margin: 20px; background: yellow;';
        questionDiv.innerHTML = `
          <h2>DEBUG: Question Found!</h2>
          <p>${data.question.questionText}</p>
          <p>If you see this yellow box but not the actual question, the UI is broken.</p>
        `;
        container.prepend(questionDiv);
        console.log('✅ Debug question injected - look for yellow box!');
      } else {
        console.log('❌ No suitable container found');
      }
    } else {
      console.log('❌ No question in response');
    }
  })
  .catch(err => {
    console.error('Fetch failed:', err);
  });

// Check for error boundaries
console.log('\n7️⃣ Checking for React errors...');
const errorElements = document.querySelectorAll('[class*="error"], [class*="Error"]');
console.log('Error elements found:', errorElements.length);
errorElements.forEach(el => console.log('Error element:', el));

// Service worker check
console.log('\n8️⃣ Checking service workers...');
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    console.log('Service workers:', registrations.length);
    registrations.forEach(reg => {
      console.log('SW Scope:', reg.scope);
      console.log('SW Active:', reg.active?.state);
    });
  });
}

console.log('\n✅ Debug complete. Check for the yellow box on the page!');
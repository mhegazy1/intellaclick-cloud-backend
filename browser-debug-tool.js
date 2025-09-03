/**
 * IntellaQuiz Browser Debug Tool
 * Run this in any browser console to diagnose why questions aren't appearing
 * 
 * Usage: 
 * 1. Copy this entire file
 * 2. Open browser console (F12 → Console)
 * 3. Paste and press Enter
 * 4. Follow the prompts
 */

(function() {
  console.clear();
  console.log('%c🔍 IntellaQuiz Debug Tool Started', 'color: #00f; font-size: 16px; font-weight: bold');
  
  const sessionCode = prompt('Enter your session code:');
  if (!sessionCode) {
    console.error('No session code provided');
    return;
  }
  
  const API_BASE = 'https://api.intellaclick.com/api';
  let sessionId = null;
  let testResults = {
    sessionFound: false,
    sessionId: null,
    hasCurrentQuestion: false,
    cacheStatus: null,
    connectionMode: null,
    errors: []
  };
  
  console.log(`\n📋 Testing session: ${sessionCode}\n`);
  
  // Test 1: Session lookup
  console.log('1️⃣ Checking session...');
  fetch(`${API_BASE}/sessions/code/${sessionCode}`)
    .then(r => {
      console.log(`   Status: ${r.status}`);
      return r.json();
    })
    .then(data => {
      if (data.success && data.session) {
        testResults.sessionFound = true;
        testResults.sessionId = data.session.id;
        sessionId = data.session.id;
        
        console.log(`   ✅ Session found!`);
        console.log(`   📌 Session ID: ${data.session.id}`);
        console.log(`   👥 Participants: ${data.session.participantCount}`);
        console.log(`   🔄 Status: ${data.session.status}`);
        console.log(`   ❓ Has current question: ${data.session.currentQuestion ? 'YES' : 'NO'}`);
        
        if (data.session.currentQuestion) {
          console.log(`   📝 Question preview: "${data.session.currentQuestion.questionText?.substring(0, 50)}..."`);
        }
      } else {
        console.error('   ❌ Session not found');
        testResults.errors.push('Session not found');
      }
      
      // Test 2: Current question endpoint
      console.log('\n2️⃣ Checking current question endpoint...');
      return fetch(`${API_BASE}/sessions/code/${sessionCode}/current-question?t=${Date.now()}`, {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
    })
    .then(r => {
      // Check cache headers
      const cacheControl = r.headers.get('cache-control');
      const cfCache = r.headers.get('cf-cache-status');
      
      console.log(`   📦 Cache-Control: ${cacheControl || 'Not set'}`);
      if (cfCache) {
        testResults.cacheStatus = cfCache;
        console.log(`   ☁️ CloudFlare Cache: ${cfCache}`);
        if (cfCache === 'HIT') {
          console.warn('   ⚠️ WARNING: Response served from cache!');
          testResults.errors.push('CloudFlare serving cached response');
        }
      }
      
      return r.json();
    })
    .then(data => {
      if (data.question) {
        testResults.hasCurrentQuestion = true;
        console.log('   ✅ Question is available!');
        console.log(`   📄 Question: "${data.question.questionText}"`);
        console.log(`   🔤 Type: ${data.question.type}`);
        console.log(`   📊 Options: ${data.question.options?.length || 0}`);
      } else {
        console.log('   ⏸️ No active question');
        console.log(`   Session status: ${data.sessionStatus}`);
      }
      
      // Test 3: Connection detection
      console.log('\n3️⃣ Detecting connection mode...');
      
      // Check for WebSocket
      const hasSocketIO = typeof io !== 'undefined';
      const sockets = hasSocketIO ? io.sockets : [];
      
      console.log(`   🔌 Socket.IO available: ${hasSocketIO ? 'YES' : 'NO'}`);
      if (hasSocketIO && sockets.length > 0) {
        console.log(`   📡 Active sockets: ${sockets.length}`);
        testResults.connectionMode = 'WebSocket';
      } else {
        console.log('   📊 Using REST API (polling mode)');
        testResults.connectionMode = 'REST';
      }
      
      // Test 4: Device & Network Info
      console.log('\n4️⃣ Device information...');
      console.log(`   📱 User Agent: ${navigator.userAgent}`);
      console.log(`   🌐 Online: ${navigator.onLine ? 'YES' : 'NO'}`);
      console.log(`   🔒 Protocol: ${location.protocol}`);
      console.log(`   🏠 Host: ${location.host}`);
      console.log(`   ⏰ Local time: ${new Date().toISOString()}`);
      
      // Test 5: Storage check
      console.log('\n5️⃣ Checking browser storage...');
      const participantId = localStorage.getItem('participantId');
      const sessionData = localStorage.getItem('currentSession');
      
      console.log(`   💾 Participant ID: ${participantId || 'Not set'}`);
      console.log(`   📋 Session data: ${sessionData ? 'Present' : 'Not found'}`);
      
      // Test 6: Live monitoring
      console.log('\n6️⃣ Starting live monitor...');
      console.log('   👁️ Watching for questions (press Ctrl+C to stop)');
      console.log('   ' + '─'.repeat(50));
      
      let pollCount = 0;
      const pollInterval = setInterval(() => {
        pollCount++;
        fetch(`${API_BASE}/sessions/code/${sessionCode}/current-question?t=${Date.now()}`, {
          headers: { 'Cache-Control': 'no-cache' }
        })
          .then(r => r.json())
          .then(data => {
            const time = new Date().toLocaleTimeString();
            const hasQuestion = !!data.question;
            const status = hasQuestion ? '✅' : '⏸️';
            const questionText = hasQuestion ? data.question.questionText.substring(0, 40) + '...' : 'Waiting for question';
            
            console.log(`   ${time} ${status} [${pollCount}] ${questionText}`);
            
            // Alert if question appears
            if (hasQuestion && !testResults.hasCurrentQuestion) {
              console.log(`   🎉 NEW QUESTION DETECTED!`);
              testResults.hasCurrentQuestion = true;
            }
          })
          .catch(err => {
            console.error(`   ❌ Poll error: ${err.message}`);
          });
      }, 3000);
      
      // Summary after 10 seconds
      setTimeout(() => {
        console.log('\n' + '═'.repeat(60));
        console.log('📊 DIAGNOSTIC SUMMARY');
        console.log('═'.repeat(60));
        
        console.log(`Session Code: ${sessionCode}`);
        console.log(`Session Found: ${testResults.sessionFound ? '✅ YES' : '❌ NO'}`);
        
        if (testResults.sessionFound) {
          console.log(`Session ID: ${testResults.sessionId}`);
          console.log(`Current Question: ${testResults.hasCurrentQuestion ? '✅ YES' : '❌ NO'}`);
          console.log(`Connection Mode: ${testResults.connectionMode}`);
          console.log(`Cache Status: ${testResults.cacheStatus || 'No CloudFlare cache'}`);
        }
        
        if (testResults.errors.length > 0) {
          console.log('\n⚠️ Issues detected:');
          testResults.errors.forEach(err => console.log(`   - ${err}`));
        }
        
        console.log('\n💡 Recommendations:');
        if (!testResults.sessionFound) {
          console.log('   1. Verify session code is correct');
          console.log('   2. Check if session has expired');
        } else if (!testResults.hasCurrentQuestion) {
          console.log('   1. Ensure question was sent from PowerPoint');
          console.log('   2. Check if you\'re connected to the right session');
          console.log('   3. Clear browser cache and reload');
        }
        if (testResults.cacheStatus === 'HIT') {
          console.log('   1. CloudFlare is caching responses - this is a problem!');
          console.log('   2. Contact support to fix cache headers');
        }
        
        console.log('\n📌 Keep monitor running to watch for changes...');
        console.log('Press Ctrl+C or close console to stop monitoring\n');
      }, 10000);
      
    })
    .catch(err => {
      console.error('❌ Debug tool error:', err);
      testResults.errors.push(err.message);
    });
    
  // Compare with another session ID
  window.compareSessionIds = function(otherSessionId) {
    if (sessionId === otherSessionId) {
      console.log('✅ Session IDs match! Same session.');
    } else {
      console.log('❌ DIFFERENT SESSIONS! This is the problem!');
      console.log(`   This device: ${sessionId}`);
      console.log(`   Other device: ${otherSessionId}`);
    }
  };
  
  console.log('\n💡 TIP: To compare session IDs, run on other device and then:');
  console.log('   compareSessionIds("other-device-session-id")');
  
})();
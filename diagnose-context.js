// Diagnose React Context Issue
console.clear();
console.log('%c🔍 Diagnosing React Context', 'color: blue; font-size: 16px');

// Look for React DevTools
const hasReactDevTools = !!(window.__REACT_DEVTOOLS_GLOBAL_HOOK__);
console.log('React DevTools available:', hasReactDevTools);

// Try to access React fiber
const findReactFiber = (dom) => {
  const key = Object.keys(dom).find(key => key.startsWith('__reactFiber$'));
  return dom[key];
};

const findReactState = () => {
  const root = document.getElementById('root');
  if (!root) return null;
  
  let fiber = findReactFiber(root);
  let contexts = [];
  let components = [];
  
  // Walk the fiber tree
  const walkFiber = (node, depth = 0) => {
    if (!node || depth > 20) return;
    
    // Check for context providers
    if (node.elementType && node.elementType._context) {
      contexts.push({
        name: node.elementType._context.displayName || 'Unknown Context',
        value: node.memoizedProps?.value
      });
    }
    
    // Check for components with hooks
    if (node.memoizedState && node.elementType) {
      const name = node.elementType.name || node.elementType.displayName || 'Unknown';
      if (name.includes('Session') || name.includes('Unified')) {
        components.push({
          name,
          state: node.memoizedState,
          props: node.memoizedProps
        });
      }
    }
    
    // Walk children
    if (node.child) walkFiber(node.child, depth + 1);
    if (node.sibling) walkFiber(node.sibling, depth);
  };
  
  walkFiber(fiber);
  
  return { contexts, components };
};

console.log('\n🔍 Searching React tree...');
const reactData = findReactState();

if (reactData) {
  console.log('\n📦 Found Contexts:', reactData.contexts.length);
  reactData.contexts.forEach(ctx => {
    console.log(`  - ${ctx.name}:`, ctx.value);
  });
  
  console.log('\n🧩 Found Session Components:', reactData.components.length);
  reactData.components.forEach(comp => {
    console.log(`  - ${comp.name}:`, comp.state);
  });
}

// Check if polling is happening
console.log('\n📡 Checking network activity...');
const checkPolling = () => {
  const entries = performance.getEntriesByType('resource');
  const recentAPICalls = entries.filter(e => 
    e.name.includes('current-question') && 
    e.startTime > performance.now() - 5000
  );
  
  console.log(`Found ${recentAPICalls.length} recent question polls`);
  
  if (recentAPICalls.length > 0) {
    // Get the most recent one
    const latest = recentAPICalls[recentAPICalls.length - 1];
    
    // Fetch it again to see the response
    fetch(latest.name)
      .then(r => r.json())
      .then(data => {
        console.log('\n📥 Latest poll response:');
        console.log('Has question:', !!data.question);
        if (data.question) {
          console.log('Question ID:', data.question.id);
          console.log('Question text:', data.question.questionText);
        }
        
        console.log('\n❓ DIAGNOSIS:');
        if (data.question) {
          console.log('✅ API returns question');
          console.log('❌ React context not updating');
          console.log('🔧 Possible causes:');
          console.log('  1. Connection service not calling setState');
          console.log('  2. Context not re-rendering');
          console.log('  3. State update being blocked');
        } else {
          console.log('❌ API returns no question');
          console.log('🔧 Check if question was sent from PowerPoint');
        }
      });
  } else {
    console.log('❌ No recent polling detected!');
    console.log('🔧 Connection service may not be running');
  }
};

// Check polling after a delay
setTimeout(checkPolling, 2000);

// Manual state injection test
console.log('\n💉 Testing manual state update...');
window.testQuestionUpdate = () => {
  // Try to find and update the context
  const event = new CustomEvent('intellaquiz:question', {
    detail: {
      id: 'test-123',
      questionText: 'TEST: If you see this, manual updates work!',
      type: 'multiple_choice',
      options: [
        { id: 'A', text: 'Option A' },
        { id: 'B', text: 'Option B' }
      ]
    }
  });
  window.dispatchEvent(event);
  console.log('Dispatched test question event');
};

console.log('\nRun window.testQuestionUpdate() to test manual updates');
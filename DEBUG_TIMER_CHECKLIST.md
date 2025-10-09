# Timer Update Debugging Checklist

## Issue: +15s button in PowerPoint doesn't update student timer

### 1. Test the Backend Directly

First, let's verify the backend is working:

```bash
# Get your auth token from the desktop app login
export INTELLACLICK_TOKEN="your-auth-token-here"

# Run the test script
node test-timer-update.js
```

This will:
- Find your active session
- Get the current question
- Add 15 seconds to the timer
- Verify the update worked

### 2. Check Desktop App Console

1. Open the desktop app
2. Press `Ctrl+Shift+I` (or `Cmd+Option+I` on Mac) to open Developer Tools
3. Go to the Console tab
4. Click the +15s button in PowerPoint
5. Look for these messages:
   - `Add time requested from overlay: 15`
   - `Updating cloud question timer`
   - `[CloudAPI] Updating question timer:`

If you don't see these, the button click isn't reaching the handler.

### 3. Check Network Tab

1. In Developer Tools, go to Network tab
2. Clear the network log
3. Click the +15s button
4. Look for a POST request to:
   - URL: `https://api.intellaclick.com/api/sessions/{id}/questions/{id}/timer`
   - Should have `x-auth-token` header
   - Body should contain `{ "addSeconds": 15 }`

### 4. Common Issues and Solutions

#### A. No console messages when clicking +15s
**Problem**: The IPC event isn't being sent from the overlay
**Solution**: Check if the overlay HTML has the correct button handler

#### B. "Updating cloud question timer" but no network request
**Problem**: The cloud API service isn't authenticated
**Check**:
```javascript
// In desktop app console:
require('./src/services/cloudApiService').isAuthenticated()
```

#### C. Network request fails with 401
**Problem**: Auth token is missing or expired
**Solution**: Log out and log back in to get a fresh token

#### D. Network request succeeds but timer doesn't update
**Problem**: Student portal not polling for updates
**Check**: In student browser console, look for periodic GET requests to:
- `/api/sessions/code/{code}/current-question`

### 5. Manual Testing in Desktop App Console

Run this in the desktop app's Developer Console:

```javascript
// Get the cloud API service
const api = require('./src/services/cloudApiService');

// Check authentication
console.log('Authenticated:', api.isAuthenticated());

// Get current session
const session = api.getCurrentSession();
console.log('Current session:', session);

// Manually test timer update
if (session && session.id) {
  api.updateQuestionTimer(session.id, 'current', 15)
    .then(result => console.log('Timer update result:', result))
    .catch(err => console.error('Timer update error:', err));
}
```

### 6. Check PowerPoint Integration

The PowerPoint controller should track the current question ID. Check if:

1. When a question is broadcast, the question ID is stored
2. The stored question ID is used when calling `updateQuestionTimer`

Look for this in the console when sending a question:
```
[CloudAPI] ✅ Question sent successfully!
```

### 7. Student Portal Debugging

In the student's browser console, run:

```javascript
// Check if timer updates are being received
const oldLog = console.log;
console.log = function(...args) {
  if (args[0] && args[0].toString().includes('Timer')) {
    oldLog('[TIMER DEBUG]', ...args);
  }
  oldLog.apply(console, args);
};
```

### 8. End-to-End Test Sequence

1. Start a cloud session in desktop app
2. Open student portal and join the session
3. Send a question from PowerPoint (30 second timer)
4. Wait for student to see the question
5. Open developer tools in both desktop app and student browser
6. Click +15s button
7. Check:
   - Desktop console shows timer update messages
   - Network tab shows POST request succeeding
   - Student portal shows new timer (45 seconds)

### 9. If Everything Looks Right But Still Not Working

The issue might be that the student portal is calculating the timer based on a fixed end time rather than the dynamic time limit. Check if the timer is using:
- ❌ `endTime = startTime + (initialTimeLimit * 1000)` (fixed)
- ✅ `endTime = startTime + (currentQuestion.timeLimit * 1000)` (dynamic)

The code shows it's using the dynamic approach, so it should work when the timeLimit updates.
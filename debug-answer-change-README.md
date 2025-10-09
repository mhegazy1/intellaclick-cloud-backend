# IntellaClick Answer Change Debug Tool

This debug script helps diagnose issues with the `allowAnswerChange` functionality in IntellaClick sessions.

## Usage

### Basic Usage
```bash
node debug-answer-change.js
```
This runs all automated tests to check the allowAnswerChange functionality.

### Check Specific Sessions
```bash
node debug-answer-change.js SESSION_CODE1 SESSION_CODE2 ...
```
Example:
```bash
node debug-answer-change.js PS32NM DEMO123
```

### Monitor Live Session
```bash
node debug-answer-change.js --monitor SESSION_CODE [duration_in_seconds]
```
Example:
```bash
node debug-answer-change.js --monitor PS32NM 60
```
This monitors a session for 60 seconds and reports any answer submission activity.

## What It Tests

1. **Session Creation Test**
   - Creates a test session with `allowAnswerChange: true`
   - Verifies it's properly saved to the database
   - Confirms the field can be retrieved correctly

2. **Existing Sessions Check**
   - Scans recent sessions to check their `allowAnswerChange` values
   - Lists all sessions that have `allowAnswerChange: true`
   - Identifies sessions missing the field

3. **API Response Flow**
   - Simulates how the API would return session data
   - Verifies `allowAnswerChange` is included in the response
   - Checks the format matches what the frontend expects

4. **Answer Submission Flow**
   - Creates a test session and simulates answer submissions
   - Tests whether answer changes are properly allowed/rejected
   - Verifies database updates work correctly

5. **Specific Session Check**
   - Examines specific session codes provided as arguments
   - Shows detailed information about the session
   - Can fix missing `allowAnswerChange` fields

6. **Live Monitoring**
   - Watches a session in real-time for answer submissions
   - Detects answer changes and reports them
   - Useful for debugging live session issues

## Expected Output

The script uses color-coded output:
- 🟢 Green: Success/Pass
- 🔴 Red: Error/Fail  
- 🟡 Yellow: Information
- 🔵 Blue: Details
- 🔷 Cyan: Test headers

## Troubleshooting Common Issues

### Issue: Answer changes not working despite checkbox being checked

**Possible causes:**
1. Field not being saved to database during session creation
2. Frontend not reading the field from API response
3. Answer submission logic not checking the field

**Debug steps:**
1. Run this script to verify backend is working correctly
2. Check browser console for the session data received
3. Monitor a live session to see actual behavior

### Issue: Some sessions missing allowAnswerChange field

**Solution:**
The script can automatically add the missing field with a default value of `false`.

### Issue: Duplicate answers being rejected even with allowAnswerChange enabled

**Check:**
1. Run the script with specific session code
2. Verify `allowAnswerChange: true` in the output
3. Monitor the session to see the actual submission behavior
4. Check frontend console for any errors during submission

## Environment Variables

The script uses the same `.env` file as the main application. Ensure these are set:
- `MONGODB_URI`: MongoDB connection string
- Other environment variables from the main application

## Requirements

- Node.js
- MongoDB connection
- Same dependencies as the main IntellaClick backend

## Frontend Integration Points

For the answer change feature to work, ensure the frontend:

1. Receives `allowAnswerChange` from the session API response
2. Stores it in the session state/context
3. Checks this value before showing "already answered" messages
4. Allows resubmission when `allowAnswerChange: true`

## API Endpoints Involved

- `GET /api/sessions/code/:sessionCode` - Returns session info including allowAnswerChange
- `POST /api/sessions` - Creates session with allowAnswerChange setting
- `POST /api/sessions/code/:sessionCode/respond` - Handles answer submissions

## Database Schema

The `allowAnswerChange` field in the Session model:
```javascript
allowAnswerChange: {
  type: Boolean,
  default: false,
  required: false,
  description: 'Whether students can change their answer while the question is still active'
}
```
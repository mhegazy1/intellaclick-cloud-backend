# Known Issues

## Quiz Session Not Showing Created Quizzes

**Date**: October 10, 2025
**Status**: Pending Investigation

### Issue
- Quizzes can be created successfully via the quiz creator
- However, when trying to start a quiz session, the created quizzes do not appear in the quiz selection dropdown
- The quiz session feature expects to load quizzes but they're not being retrieved or displayed

### Affected Components
- `/instructor-portal/create-session.html` - Quiz selection dropdown
- `/backend/routes/quizzes.js` - Quiz retrieval endpoint
- Possible issue with quiz listing endpoint or frontend loading logic

### Next Steps
1. Verify the quiz listing API endpoint is being called
2. Check if authentication is properly passing userId
3. Ensure the quiz selection dropdown is loading from the correct API endpoint
4. Test the full flow: create quiz → list quizzes → select quiz for session

### Workaround
Use Quick Poll with multiple questions instead of Quiz sessions until this is resolved.

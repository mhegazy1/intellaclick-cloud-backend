# PowerPoint Class Integration Guide

## Overview
This guide explains how to integrate PowerPoint clicker sessions with the class enrollment system.

## What's Changed

### 1. Session Model Updates
- Added `classId` field to link sessions to classes
- Added `metadata.platform` to track session source (powerpoint, web, standalone)
- Added `isEnrolled` flag to participants

### 2. New API Endpoints

#### Create Class-Based Session
```
POST /api/sessions-enhanced/create-for-class
Headers: Authorization: Bearer {token}
Body: {
  "title": "Lecture 5 - Chemical Bonds",
  "classId": "60abc123...",
  "platform": "powerpoint"
}
Response: {
  "sessionCode": "ABC123",
  "joinUrl": "https://join.intellaclick.com/session/ABC123"
}
```

#### Join with Enrollment Check
```
POST /api/sessions-enhanced/join-class-session
Body: {
  "sessionCode": "ABC123",
  "userId": "60def456...",
  "name": "John Doe"
}
```

### 3. PowerPoint Add-in Updates Required

The PowerPoint add-in needs to be updated to:

1. **On Startup**: 
   - Show list of instructor's classes
   - Let instructor select which class this session is for

2. **When Starting Session**:
   - Call `/api/sessions-enhanced/create-for-class` instead of `/api/sessions`
   - Pass the selected `classId`
   - Set `platform: "powerpoint"`

3. **Student Join Flow**:
   - Students must be logged in (no anonymous participation for class sessions)
   - Only enrolled students can join
   - Non-enrolled students see the class join code

### 4. Benefits

1. **Attendance Tracking**: Automatically tracks which enrolled students attended
2. **Grade Integration**: Responses tied to student accounts
3. **Analytics**: Class-level participation reports
4. **Security**: Only enrolled students can participate

## Implementation Steps

### For Desktop App Team:

1. **Update Session Creation**:
```javascript
// Old way
const session = await api.post('/api/sessions', {
  title: 'My Session'
});

// New way
const session = await api.post('/api/sessions-enhanced/create-for-class', {
  title: 'My Session',
  classId: selectedClassId,
  platform: 'powerpoint'
});
```

2. **Update Join URL Display**:
   - Show class name along with session code
   - Indicate that login is required

3. **Add Class Selection UI**:
   - Fetch instructor's classes: `GET /api/classes`
   - Show dropdown/list for class selection
   - Save selected class for session

### For Student Portal:

The existing join flow at `join.intellaclick.com` will automatically:
- Detect class-based sessions
- Require login
- Check enrollment
- Show appropriate error messages

## Testing

1. Create a class in instructor portal
2. Add some students via join code
3. Start PowerPoint session linked to that class
4. Verify only enrolled students can join
5. Check attendance is tracked in class analytics

## Rollback Plan

If issues arise, PowerPoint can continue using the original `/api/sessions` endpoints which work without class enrollment checks.
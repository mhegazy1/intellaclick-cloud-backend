# Teaching Assistant System & Clicker Results Sync Documentation

## Table of Contents
1. [Teaching Assistant (TA) System](#teaching-assistant-system)
2. [Clicker Results Sync](#clicker-results-sync)
3. [Integration Guide](#integration-guide)

## Teaching Assistant System

### Overview
The TA system provides granular permission control, allowing instructors to delegate specific responsibilities to teaching assistants while maintaining control over sensitive operations.

### Key Features
- **Granular Permissions**: 30+ individual permissions across 6 categories
- **Time Restrictions**: Limit TA access to specific days/hours
- **Audit Trail**: Track when TAs access the system
- **Role-Based UI**: Show/hide features based on permissions

### Permission Categories

#### 1. Session Permissions
- `canCreateSessions` - Create live clicker sessions
- `canEndSessions` - End active sessions
- `canViewSessionResults` - View session results and analytics
- `canExportSessionData` - Export session data to CSV/PDF

#### 2. Question Permissions
- `canViewQuestions` - View existing questions
- `canCreateQuestions` - Create new questions
- `canEditQuestions` - Modify existing questions
- `canDeleteQuestions` - Delete questions

#### 3. Student Permissions
- `canViewRoster` - View class roster
- `canViewStudentScores` - View individual student scores
- `canModifyGrades` - Modify student grades
- `canAddStudents` - Add students to class
- `canRemoveStudents` - Remove students from class
- `canViewStudentContact` - View student email/contact info

#### 4. Analytics Permissions
- `canViewClassAnalytics` - View overall class performance
- `canViewIndividualAnalytics` - View detailed individual student analytics
- `canGenerateReports` - Generate class reports
- `canViewGamificationData` - View leaderboards and achievements

#### 5. Content Permissions
- `canViewQuizzes` - View existing quizzes
- `canCreateQuizzes` - Create new quizzes
- `canEditQuizzes` - Modify existing quizzes
- `canScheduleQuizzes` - Schedule quizzes for future

#### 6. Administrative Permissions
- `canModifyClassSettings` - Change class name, term, etc.
- `canManageOtherTAs` - Add/remove other TAs
- `canViewAuditLog` - View who did what in the class

### API Endpoints

#### Managing TAs (Instructor Only)

**Get all TAs for a class**
```
GET /api/ta-management/class/:classId/tas
Authorization: Bearer {instructor-token}
```

**Add a TA**
```
POST /api/ta-management/class/:classId/tas
Authorization: Bearer {instructor-token}
Body: {
  "taEmail": "ta@university.edu",
  "permissions": {
    "session": {
      "canCreateSessions": true,
      "canViewSessionResults": true
    },
    "student": {
      "canViewRoster": true,
      "canViewStudentScores": true
    }
  },
  "timeRestrictions": {
    "allowedDays": ["monday", "wednesday", "friday"],
    "allowedHours": { "start": 9, "end": 17 }
  },
  "notes": "TA for MWF sections"
}
```

**Update TA permissions**
```
PUT /api/ta-management/class/:classId/tas/:taId
Authorization: Bearer {instructor-token}
Body: {
  "permissions": { ... },
  "isActive": true
}
```

**Remove a TA**
```
DELETE /api/ta-management/class/:classId/tas/:taId
Authorization: Bearer {instructor-token}
```

#### For TAs

**Get my permissions**
```
GET /api/ta-management/my-permissions/:classId
Authorization: Bearer {ta-token}
```

**Get available permissions (for UI)**
```
GET /api/ta-management/available-permissions
Authorization: Bearer {token}
```

### Using Permissions in Routes

```javascript
// Example: Create session (requires permission)
router.post('/create-session', 
  auth, 
  checkTAPermission('session', 'canCreateSessions'),
  async (req, res) => {
    // req.userRole will be 'instructor' or 'teaching_assistant'
    // req.taPermissions available if TA
  }
);

// Example: Check any class access
router.get('/class-data/:classId',
  auth,
  checkTAPermission.hasClassAccess,
  async (req, res) => {
    // User has some level of access to this class
  }
);
```

### Time Restrictions

TAs can be restricted to specific times:

```javascript
{
  "timeRestrictions": {
    "startDate": "2025-09-01",        // Optional: When access begins
    "endDate": "2025-12-20",          // Optional: When access ends
    "allowedDays": [                  // Optional: Which days
      "monday", "tuesday", "wednesday", 
      "thursday", "friday"
    ],
    "allowedHours": {                 // Optional: Which hours (24-hour)
      "start": 9,   // 9 AM
      "end": 17     // 5 PM
    }
  }
}
```

## Clicker Results Sync

### Overview
The clicker sync system enables the desktop app to send session results to the cloud, where they are processed, stored, and gamification is applied.

### Data Flow
1. Desktop app runs clicker session (PowerPoint or standalone)
2. Session ends, desktop app collects all data
3. Desktop app sends results to `/api/clicker-sync/sync-session-results`
4. Backend processes results, applies gamification
5. Results available in instructor portal

### API Endpoints

#### Sync Single Session
```
POST /api/clicker-sync/sync-session-results
Authorization: Bearer {instructor-token}
Body: {
  "sessionCode": "ABC123",
  "platform": "powerpoint",  // or "standalone"
  "classId": "60abc...",
  "startTime": "2025-09-10T10:00:00Z",
  "endTime": "2025-09-10T10:50:00Z",
  "questions": [
    {
      "id": "q1",
      "text": "What is 2+2?",
      "type": "multiple_choice",
      "options": ["3", "4", "5", "6"],
      "correctAnswer": "4",
      "points": 10,
      "sentAt": "2025-09-10T10:05:00Z"
    }
  ],
  "participants": [
    {
      "userId": "60def...",
      "participantId": "P123",
      "name": "John Doe",
      "deviceId": "device123",
      "joinedAt": "2025-09-10T10:01:00Z",
      "isEnrolled": true
    }
  ],
  "responses": [
    {
      "userId": "60def...",
      "participantId": "P123",
      "questionId": "q1",
      "answer": "4",
      "submittedAt": "2025-09-10T10:05:30Z"
    }
  ],
  "metadata": {
    "presentationName": "Chapter 5 Review",
    "slideCount": 20
  }
}
```

Response:
```json
{
  "success": true,
  "sessionId": "60xyz...",
  "analytics": {
    "totalParticipants": 25,
    "averageScore": 85.5,
    "questionAnalytics": [...],
    "participantPerformance": [...]
  },
  "gamificationProcessed": true
}
```

#### Batch Sync (for offline sessions)
```
POST /api/clicker-sync/batch-sync-sessions
Authorization: Bearer {instructor-token}
Body: {
  "sessions": [
    { /* session 1 data */ },
    { /* session 2 data */ },
    { /* session 3 data */ }
  ]
}
```

#### Get Session Results
```
GET /api/clicker-sync/session-results/:sessionId
Authorization: Bearer {instructor-token}
```

#### Get All Class Sessions
```
GET /api/clicker-sync/class-sessions/:classId?platform=powerpoint&startDate=2025-09-01
Authorization: Bearer {instructor-token}
```

### Data Processing

When session results are synced:

1. **Session Storage**: All data is stored in the Session model
2. **Gamification**: If linked to a class, points and achievements are processed
3. **Analytics**: Detailed analytics are generated
4. **Class Updates**: Recent sessions list is updated

### Analytics Generated

- **Overall Stats**: Participation rate, average score, duration
- **Per-Question Analytics**: 
  - Response count and distribution
  - Accuracy percentage
  - Average response time
- **Per-Participant Performance**:
  - Individual scores
  - Response times
  - Points earned (if enrolled)
- **Gamification Results** (if class-linked):
  - Points awarded
  - Achievements unlocked
  - Level progress

## Integration Guide

### Desktop App Integration

#### 1. Starting a Session
```javascript
// When starting a clicker session
const sessionData = {
  classId: selectedClass.id,  // Optional: for class-linked sessions
  platform: 'powerpoint',
  title: 'Chapter 5 Review'
};

// Create session (if class-linked)
if (sessionData.classId) {
  const response = await fetch('/api/sessions-enhanced/create-for-class', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(sessionData)
  });
  const { sessionCode } = await response.json();
  session.code = sessionCode;
}
```

#### 2. During Session
- Collect all participant joins
- Track all question sends
- Store all responses with timestamps

#### 3. Ending Session
```javascript
// Prepare data for sync
const syncData = {
  sessionCode: session.code,
  platform: 'powerpoint',
  classId: session.classId,
  startTime: session.startTime,
  endTime: new Date(),
  questions: session.questions.map(q => ({
    id: q.id,
    text: q.text,
    type: q.type,
    options: q.options,
    correctAnswer: q.correctAnswer,
    points: q.points || 10,
    sentAt: q.sentAt
  })),
  participants: Array.from(session.participants.values()),
  responses: session.allResponses,
  metadata: {
    presentationName: presentation.name,
    slideCount: presentation.slides.length
  }
};

// Sync to cloud
const response = await fetch('/api/clicker-sync/sync-session-results', {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(syncData)
});
```

#### 4. Offline Support
- Store session data locally if offline
- When online, use batch sync endpoint
- Mark synced sessions to avoid duplicates

### Instructor Portal Integration

#### 1. Session List Page
```javascript
// Fetch all sessions for a class
const response = await fetch(`/api/clicker-sync/class-sessions/${classId}?platform=all`);
const { sessions } = await response.json();

// Display with platform icons
sessions.forEach(session => {
  const icon = session.platform === 'powerpoint' ? '📊' : '📱';
  // Display session info
});
```

#### 2. Session Results Page
```javascript
// Get detailed results
const response = await fetch(`/api/clicker-sync/session-results/${sessionId}`);
const { session, analytics, gamificationData } = await response.json();

// Display comprehensive results
// - Question-by-question breakdown
// - Participant leaderboard
// - Response distributions
// - Gamification summary
```

#### 3. TA Access Control
```javascript
// Check if user can view results
if (userRole === 'teaching_assistant') {
  const perms = await getMyPermissions(classId);
  if (!perms.session.canViewSessionResults) {
    showError('You do not have permission to view session results');
    return;
  }
}
```

### Security Considerations

1. **TA Permissions**: Always verified server-side
2. **Time Restrictions**: Checked on every request
3. **Audit Trail**: All TA actions are logged
4. **Data Validation**: All sync data is validated
5. **Access Control**: Instructors can only sync their own sessions

### Best Practices

1. **For Instructors**:
   - Start with minimal TA permissions
   - Use time restrictions for temporary TAs
   - Review TA activity regularly
   - Revoke access when no longer needed

2. **For Desktop App**:
   - Always include platform identifier
   - Sync immediately when online
   - Batch sync when coming back online
   - Include all metadata for better analytics

3. **For Portal Development**:
   - Check permissions before showing UI elements
   - Cache permission checks per session
   - Show clear error messages for permission denials
   - Indicate when viewing as TA vs instructor

## Summary

The system now provides:
- ✅ Flexible TA permission system with 30+ granular permissions
- ✅ Time-based access restrictions
- ✅ Complete clicker session results sync
- ✅ Automatic gamification processing
- ✅ Comprehensive analytics generation
- ✅ Unified results view in instructor portal
- ✅ Support for both PowerPoint and standalone sessions
- ✅ Offline session support with batch sync

All features are production-ready with proper validation, error handling, and security checks.
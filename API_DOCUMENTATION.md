# IntellaQuiz Cloud API Documentation

## Base URL
- Production: `https://api.intellaclick.com/api`
- Development: `http://localhost:5000/api`

## Authentication
All protected endpoints require JWT token in header:
```
x-auth-token: <jwt-token>
```

## Endpoints

### Authentication

#### POST /auth/register
Register a new instructor account.

**Request Body:**
```json
{
  "email": "instructor@example.com",
  "password": "secure-password",
  "firstName": "John",
  "lastName": "Doe",
  "role": "instructor"
}
```

**Response:**
```json
{
  "success": true,
  "token": "jwt-token-here",
  "user": {
    "id": "user-id",
    "email": "instructor@example.com",
    "name": "John Doe",
    "firstName": "John",
    "lastName": "Doe",
    "role": "instructor",
    "joinedAt": "2025-01-26T..."
  }
}
```

#### POST /auth/login
Login with existing account.

**Request Body:**
```json
{
  "email": "instructor@example.com",
  "password": "secure-password"
}
```

**Response:**
```json
{
  "success": true,
  "token": "jwt-token-here",
  "user": {
    "id": "user-id",
    "email": "instructor@example.com",
    "name": "John Doe",
    "firstName": "John",
    "lastName": "Doe",
    "role": "instructor",
    "joinedAt": "2025-01-26T..."
  }
}
```

### Sessions

#### POST /sessions
Create a new clicker session.

**Headers:**
- `x-auth-token: <jwt-token>` (required)

**Request Body:**
```json
{
  "title": "Physics Quiz - Chapter 5"
}
```

**Response:**
```json
{
  "success": true,
  "session": {
    "id": "session-id",
    "sessionCode": "ABC123",
    "title": "Physics Quiz - Chapter 5",
    "status": "waiting",
    "createdAt": "2025-01-26T..."
  }
}
```

#### GET /sessions
Get all sessions for the authenticated instructor.

**Headers:**
- `x-auth-token: <jwt-token>` (required)

**Response:**
```json
{
  "success": true,
  "sessions": [
    {
      "id": "session-id",
      "sessionCode": "ABC123",
      "title": "Physics Quiz - Chapter 5",
      "status": "waiting",
      "participantCount": 0,
      "responseCount": 0,
      "createdAt": "2025-01-26T...",
      "startedAt": null,
      "endedAt": null
    }
  ]
}
```

#### POST /sessions/:id/questions
Send a question to the session (starts session if in 'waiting' status).

**Headers:**
- `x-auth-token: <jwt-token>` (required)

**Request Body:**
```json
{
  "questionId": "Q1234567890",
  "questionText": "What is the speed of light?",
  "questionType": "multiple_choice",
  "options": [
    "299,792,458 m/s",
    "300,000,000 m/s",
    "186,282 miles/s",
    "All of the above"
  ],
  "correctAnswer": "3",
  "points": 10,
  "timeLimit": 30
}
```

**Response:**
```json
{
  "success": true,
  "message": "Question sent successfully",
  "question": {
    "questionId": "Q1234567890",
    "questionText": "What is the speed of light?",
    "questionType": "multiple_choice",
    "options": [...],
    "correctAnswer": "3",
    "points": 10,
    "timeLimit": 30,
    "startedAt": "2025-01-26T..."
  }
}
```

#### POST /sessions/:id/questions/:questionId/end
End the current question in a session.

**Headers:**
- `x-auth-token: <jwt-token>` (required)

**Response:**
```json
{
  "success": true,
  "message": "Question ended"
}
```

#### POST /sessions/:id/end
End the entire session.

**Headers:**
- `x-auth-token: <jwt-token>` (required)

**Response:**
```json
{
  "success": true,
  "session": {
    "id": "session-id",
    "status": "ended",
    "startedAt": "2025-01-26T...",
    "endedAt": "2025-01-26T..."
  }
}
```

## Desktop App Integration

### Recommended Flow

1. **On Desktop App Start:**
   - Check for stored JWT token
   - If no token, prompt for login
   - Store token securely for future use

2. **Creating a Session:**
   ```javascript
   const response = await fetch('https://api.intellaclick.com/api/sessions', {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'x-auth-token': token
     },
     body: JSON.stringify({
       title: 'Quiz Title Here'
     })
   });
   
   const data = await response.json();
   const sessionCode = data.session.sessionCode;
   // Display sessionCode to instructor
   ```

3. **Sending Questions:**
   ```javascript
   const response = await fetch(`https://api.intellaclick.com/api/sessions/${sessionId}/questions`, {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'x-auth-token': token
     },
     body: JSON.stringify({
       questionText: 'Question text here',
       questionType: 'multiple_choice',
       options: ['A', 'B', 'C', 'D'],
       correctAnswer: '2',
       points: 10,
       timeLimit: 30
     })
   });
   ```

4. **Ending Questions:**
   ```javascript
   await fetch(`https://api.intellaclick.com/api/sessions/${sessionId}/questions/${questionId}/end`, {
     method: 'POST',
     headers: {
       'x-auth-token': token
     }
   });
   ```

5. **Ending Session:**
   ```javascript
   await fetch(`https://api.intellaclick.com/api/sessions/${sessionId}/end`, {
     method: 'POST',
     headers: {
       'x-auth-token': token
     }
   });
   ```

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message here"
}
```

Common HTTP status codes:
- `400` - Bad Request (missing or invalid parameters)
- `401` - Unauthorized (missing or invalid token)
- `403` - Forbidden (accessing resource you don't own)
- `404` - Not Found
- `500` - Internal Server Error

## Rate Limiting

API requests are limited to 100 requests per 15 minutes per IP address.
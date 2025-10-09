# Email System Setup Guide

## Overview

The IntellaClick platform now includes a complete email system for:
- ✅ Email verification for new accounts (instructors & students)
- ✅ Password reset functionality
- ✅ Welcome emails after verification
- ✅ Password change confirmation
- ✅ Session reminders (bonus feature)

## Configuration

### Environment Variables

Add these to your `.env` file in the backend directory:

```env
# Email Configuration
SMTP_HOST=smtp.gmail.com                    # Your SMTP server
SMTP_PORT=587                               # SMTP port (587 for TLS, 465 for SSL)
SMTP_SECURE=false                           # true for port 465, false for other ports
SMTP_USER=your-email@gmail.com              # SMTP username
SMTP_PASS=your-app-password                 # SMTP password or app-specific password
EMAIL_FROM=IntellaClick <noreply@intellaclick.com>  # Sender email address

# Portal URLs (for email links)
STUDENT_PORTAL_URL=https://join.intellaclick.com
INSTRUCTOR_PORTAL_URL=https://instructor.intellaclick.com
```

### Email Provider Options

#### 1. Gmail (Easiest for Testing)

1. Enable 2-Factor Authentication on your Google account
2. Generate an App Password:
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" and your device
   - Copy the 16-character password
3. Use these settings:
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-16-char-app-password
   ```

#### 2. SendGrid (Recommended for Production)

1. Sign up at https://sendgrid.com
2. Create an API key
3. Use these settings:
   ```env
   SMTP_HOST=smtp.sendgrid.net
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=apikey
   SMTP_PASS=your-sendgrid-api-key
   ```

#### 3. AWS SES (Best for High Volume)

1. Set up AWS SES and verify your domain
2. Create SMTP credentials
3. Use these settings:
   ```env
   SMTP_HOST=email-smtp.us-east-1.amazonaws.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your-aws-smtp-username
   SMTP_PASS=your-aws-smtp-password
   ```

#### 4. Mailgun

1. Sign up at https://mailgun.com
2. Get SMTP credentials from your dashboard
3. Use these settings:
   ```env
   SMTP_HOST=smtp.mailgun.org
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your-mailgun-username
   SMTP_PASS=your-mailgun-password
   ```

### Development Mode

In development, the system automatically uses **Ethereal Email** (https://ethereal.email) for testing:
- No configuration needed
- Emails are captured but not sent
- Check console for preview URLs
- Perfect for testing without spamming real inboxes

## API Endpoints

### Instructor Endpoints

**Register** (automatically sends verification email)
```
POST /api/auth/register
Body: { email, password, firstName, lastName }
```

**Send/Resend Verification Email**
```
POST /api/auth/send-verification
Headers: Authorization: Bearer <token>
```

**Verify Email**
```
GET /api/auth/verify-email/:token
```

**Request Password Reset**
```
POST /api/auth/forgot-password
Body: { email }
```

**Reset Password**
```
POST /api/auth/reset-password
Body: { token, password }
```

### Student Endpoints

**Register** (automatically sends verification email)
```
POST /api/students/register
Body: { email, password, firstName, lastName, termsAccepted, privacyAccepted }
```

**Resend Verification Email**
```
POST /api/students/resend-verification
Body: { email }
```

**Verify Email**
```
POST /api/students/verify-email
Body: { token }
```

**Request Password Reset**
```
POST /api/students/forgot-password
Body: { email }
```

**Reset Password**
```
POST /api/students/reset-password
Body: { token, password }
```

## Email Templates

The system includes pre-built templates for:

1. **Verification Email** - Sent when users register
2. **Password Reset Email** - Sent when users request password reset
3. **Welcome Email** - Sent after email verification
4. **Password Change Confirmation** - Sent after successful password reset
5. **Session Reminder** - Can be sent before live sessions (bonus)

All templates are responsive and include:
- Professional styling
- Clear call-to-action buttons
- Fallback text links
- Mobile-friendly design

## Frontend Integration

### Instructor Portal

Create these pages in your instructor portal:

**1. Verify Email Page** (`/verify-email`)
```javascript
// Parse token from URL query parameter
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');

// Call verification endpoint
fetch(`https://api.intellaclick.com/api/auth/verify-email/${token}`)
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      // Show success message and redirect to login/dashboard
    }
  });
```

**2. Reset Password Page** (`/reset-password`)
```javascript
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');

// Show password form and submit
fetch('https://api.intellaclick.com/api/auth/reset-password', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token, password: newPassword })
});
```

**3. Forgot Password Page** (`/forgot-password`)
```javascript
fetch('https://api.intellaclick.com/api/auth/forgot-password', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email })
});
```

### Student Portal

Same implementation as instructor portal, but use student endpoints:
- `/api/students/verify-email` (POST with token in body)
- `/api/students/reset-password`
- `/api/students/forgot-password`

## Testing

### 1. Test Registration Flow

```bash
# Register new user
curl -X POST https://api.intellaclick.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","firstName":"Test","lastName":"User"}'

# Check email inbox for verification link
# Click link or copy token and verify
```

### 2. Test Password Reset Flow

```bash
# Request password reset
curl -X POST https://api.intellaclick.com/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Check email for reset link
# Use token to reset password
curl -X POST https://api.intellaclick.com/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"YOUR_TOKEN","password":"NewPass123!"}'
```

## Security Features

✅ Tokens are hashed (SHA-256) before storing in database
✅ Verification tokens expire after 24 hours
✅ Password reset tokens expire after 1 hour
✅ Email addresses are not revealed in forgot-password responses
✅ Rate limiting on authentication endpoints
✅ Passwords are hashed with bcrypt (12 rounds for students, 10 for instructors)

## Database Schema

### User Model (Instructors)
```javascript
{
  emailVerified: Boolean (default: false),
  verificationToken: String (hashed),
  verificationExpires: Date,
  verifiedAt: Date,
  resetPasswordToken: String (hashed),
  resetPasswordExpires: Date
}
```

### Student Model
```javascript
{
  verification: {
    emailVerified: Boolean (default: false),
    verificationToken: String (hashed),
    verificationExpires: Date,
    verifiedAt: Date
  },
  passwordReset: {
    resetToken: String (hashed),
    resetExpires: Date
  }
}
```

## Troubleshooting

### Emails Not Sending

1. Check environment variables are set correctly
2. Verify SMTP credentials are valid
3. Check firewall/network allows outbound SMTP connections
4. Review server logs for error messages
5. Test with Ethereal Email first (development mode)

### Gmail Issues

- Enable "Less secure app access" or use App Passwords
- Check daily sending limits (500 emails/day for free Gmail)
- Verify 2FA is enabled if using App Passwords

### Token Expired Errors

- Verification tokens expire after 24 hours
- Password reset tokens expire after 1 hour
- User must request a new token

### Production Checklist

- [ ] Update `EMAIL_FROM` to match your domain
- [ ] Use a dedicated email service (SendGrid, AWS SES, etc.)
- [ ] Set up SPF, DKIM, and DMARC records for your domain
- [ ] Monitor email delivery rates
- [ ] Set up email bounce handling
- [ ] Test all email flows in staging environment

## Bonus: Sending Custom Emails

You can use the email service to send custom emails:

```javascript
const emailService = require('./services/emailService');

// Send custom email
await emailService.sendEmail(
  'student@example.com',
  'Subject Line',
  '<h1>HTML Content</h1>',
  'Plain text fallback'
);
```

## Support

For issues or questions:
- Check the logs in `console` for detailed error messages
- Review email service provider documentation
- Test with development mode (Ethereal) first

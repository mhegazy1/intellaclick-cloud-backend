const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    // In production, use proper email service like SendGrid, AWS SES, etc.
    if (process.env.NODE_ENV === 'production') {
      // Production email configuration
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    } else {
      // Development: Use Ethereal Email for testing
      // You can view sent emails at https://ethereal.email
      nodemailer.createTestAccount((err, account) => {
        if (err) {
          console.error('Failed to create test email account:', err);
          return;
        }

        this.transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: account.user,
            pass: account.pass
          }
        });

        console.log('Test email account created:', account.user);
        console.log('View emails at: https://ethereal.email');
      });
    }

    this.from = process.env.EMAIL_FROM || 'IntellaQuiz <noreply@intellaquiz.com>';
    this.studentPortalUrl = process.env.STUDENT_PORTAL_URL || 'https://join.intellaclick.com';
    this.instructorPortalUrl = process.env.INSTRUCTOR_PORTAL_URL || 'https://instructor.intellaclick.com';
  }

  async sendEmail(to, subject, html, text) {
    try {
      const mailOptions = {
        from: this.from,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, '') // Strip HTML for text version
      };

      const info = await this.transporter.sendMail(mailOptions);

      if (process.env.NODE_ENV !== 'production') {
        console.log('Email sent:', nodemailer.getTestMessageUrl(info));
      }

      return info;
    } catch (error) {
      console.error('Email send error:', error);
      throw error;
    }
  }

  async sendVerificationEmail(email, token, data) {
    // Determine which portal to use based on user type
    const baseUrl = data.isInstructor ? this.instructorPortalUrl : this.studentPortalUrl;
    const verificationUrl = `${baseUrl}/verify-email?token=${token}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .button { display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to IntellaQuiz!</h1>
          </div>
          <div class="content">
            <h2>Hi ${data.firstName},</h2>
            <p>Thank you for creating an IntellaQuiz student account. To complete your registration, please verify your email address.</p>
            <p style="text-align: center;">
              <a href="${verificationUrl}" class="button">Verify Email Address</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; background: #fff; padding: 10px; border: 1px solid #ddd;">
              ${verificationUrl}
            </p>
            <p>This link will expire in 24 hours.</p>
            <p>If you didn't create an account, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} IntellaQuiz. All rights reserved.</p>
            <p>Questions? Contact us at support@intellaquiz.com</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail(
      email,
      'Verify your IntellaQuiz account',
      html
    );
  }

  async sendPasswordResetEmail(email, token, data) {
    // Determine which portal to use based on user type
    const baseUrl = data.isInstructor ? this.instructorPortalUrl : this.studentPortalUrl;
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #DC2626; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .button { display: inline-block; padding: 12px 24px; background-color: #DC2626; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
          .warning { background-color: #FEF3C7; border: 1px solid #F59E0B; padding: 10px; margin: 10px 0; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <h2>Hi ${data.firstName},</h2>
            <p>We received a request to reset your IntellaQuiz password. Click the button below to create a new password:</p>
            <p style="text-align: center;">
              <a href="${resetUrl}" class="button">Reset Password</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; background: #fff; padding: 10px; border: 1px solid #ddd;">
              ${resetUrl}
            </p>
            <div class="warning">
              <strong>⚠️ Security Notice:</strong> This link will expire in 1 hour. If you didn't request a password reset, please ignore this email and your password will remain unchanged.
            </div>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} IntellaQuiz. All rights reserved.</p>
            <p>Questions? Contact us at support@intellaquiz.com</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail(
      email,
      'Reset your IntellaQuiz password',
      html
    );
  }

  async sendPasswordChangeConfirmation(email, data) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #10B981; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
          .info { background-color: #E0E7FF; border: 1px solid #6366F1; padding: 10px; margin: 10px 0; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Changed Successfully</h1>
          </div>
          <div class="content">
            <h2>Hi ${data.firstName},</h2>
            <p>Your IntellaQuiz password has been successfully changed.</p>
            <div class="info">
              <strong>ℹ️ Security Information:</strong>
              <ul>
                <li>Date: ${new Date().toLocaleString()}</li>
                <li>If you made this change, no further action is needed.</li>
                <li>If you didn't make this change, please contact support immediately.</li>
              </ul>
            </div>
            <p>For security reasons, you may need to log in again on your devices.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} IntellaQuiz. All rights reserved.</p>
            <p>Questions? Contact us at support@intellaquiz.com</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail(
      email,
      'Your IntellaQuiz password has been changed',
      html
    );
  }

  async sendWelcomeEmail(email, data) {
    const baseUrl = data.isInstructor ? this.instructorPortalUrl : this.studentPortalUrl;
    const features = data.isInstructor ? `
            <div class="feature">
              <h3>📚 Create Interactive Quizzes</h3>
              <p>Build engaging assessments with multiple question types</p>
            </div>

            <div class="feature">
              <h3>📊 Live Classroom Sessions</h3>
              <p>Run real-time clicker sessions with PowerPoint integration</p>
            </div>

            <div class="feature">
              <h3>📈 Track Student Performance</h3>
              <p>Analyze results and identify areas where students need help</p>
            </div>
    ` : `
            <div class="feature">
              <h3>📚 Join Live Sessions</h3>
              <p>Participate in real-time classroom quizzes and polls</p>
            </div>

            <div class="feature">
              <h3>📊 Track Your Progress</h3>
              <p>View your performance history and identify areas for improvement</p>
            </div>

            <div class="feature">
              <h3>🏆 Compete with Classmates</h3>
              <p>See how you rank on the leaderboard and earn achievements</p>
            </div>
    `;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .button { display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .feature { background-color: white; padding: 15px; margin: 10px 0; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to IntellaQuiz!</h1>
          </div>
          <div class="content">
            <h2>Hi ${data.firstName},</h2>
            <p>Your email has been verified and your account is now active! Here's what you can do with IntellaQuiz:</p>
            ${features}
            <p style="text-align: center;">
              <a href="${baseUrl}" class="button">Get Started</a>
            </p>
            ${data.isInstructor ? '<p>Start creating quizzes or run a live session with your students!</p>' : '<p>Have a session code? Enter it after logging in to join your class!</p>'}
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} IntellaQuiz. All rights reserved.</p>
            <p>Questions? Contact us at support@intellaquiz.com</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail(
      email,
      'Welcome to IntellaQuiz!',
      html
    );
  }

  async sendSessionReminder(email, data) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #F59E0B; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .button { display: inline-block; padding: 12px 24px; background-color: #F59E0B; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .session-info { background-color: white; padding: 15px; margin: 10px 0; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Session Starting Soon!</h1>
          </div>
          <div class="content">
            <h2>Hi ${data.firstName},</h2>
            <p>Your IntellaQuiz session is starting in ${data.timeUntil}:</p>
            
            <div class="session-info">
              <h3>${data.sessionTitle}</h3>
              <p><strong>Instructor:</strong> ${data.instructorName}</p>
              <p><strong>Time:</strong> ${data.sessionTime}</p>
              <p><strong>Session Code:</strong> <span style="font-size: 24px; font-weight: bold; color: #4F46E5;">${data.sessionCode}</span></p>
            </div>
            
            <p style="text-align: center;">
              <a href="${this.studentPortalUrl}/join?code=${data.sessionCode}" class="button">Join Session</a>
            </p>
            
            <p>Make sure you're ready with your device and a stable internet connection!</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} IntellaQuiz. All rights reserved.</p>
            <p>To manage your notification preferences, visit your account settings.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail(
      email,
      `Reminder: ${data.sessionTitle} starting soon!`,
      html
    );
  }
}

// Create singleton instance
let emailService = null;

try {
  emailService = new EmailService();
} catch (error) {
  console.error('Failed to initialize email service:', error);
  // App can still run without email service in development
}

module.exports = emailService;
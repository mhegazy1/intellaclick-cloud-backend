#!/bin/bash

echo "Installing additional dependencies for student authentication..."

# Navigate to cloud-backend directory
cd "$(dirname "$0")"

# Install required packages
npm install --save nodemailer rate-limit-mongo

echo "Dependencies installed successfully!"
echo ""
echo "Added packages:"
echo "- nodemailer: For sending verification and password reset emails"
echo "- rate-limit-mongo: For distributed rate limiting in production"
echo ""
echo "Don't forget to set up environment variables:"
echo "- SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS for email"
echo "- STUDENT_PORTAL_URL (defaults to https://join.intellaclick.com)"
echo "- EMAIL_FROM (defaults to 'IntellaQuiz <noreply@intellaquiz.com>')"
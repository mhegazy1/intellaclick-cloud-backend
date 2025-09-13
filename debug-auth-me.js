const jwt = require('jsonwebtoken');

// Test script to debug the /api/auth/me endpoint issue

console.log('=== Debugging /api/auth/me endpoint ===\n');

// 1. Check token generation
const testUserId = '507f1f77bcf86cd799439011'; // Sample MongoDB ObjectId
const token = jwt.sign(
  { userId: testUserId },
  process.env.JWT_SECRET || 'dev-secret',
  { expiresIn: '7d' }
);

console.log('1. Generated token payload:');
const decoded = jwt.decode(token);
console.log(decoded);
console.log('\n');

// 2. Check how the auth middleware would process this token
console.log('2. Auth middleware token processing:');
console.log('- Token contains userId:', !!decoded.userId);
console.log('- Token contains user object:', !!decoded.user);
console.log('- Token contains id:', !!decoded.id);

// Based on the middleware code, it would create:
const reqUser = {
  _id: decoded.userId,
  id: decoded.userId,
  userId: decoded.userId
};
console.log('\n3. req.user object created by auth middleware:');
console.log(reqUser);

console.log('\n4. In /api/auth/me route:');
console.log('- Looking for user with ID:', reqUser.userId);
console.log('- This should match a User document in MongoDB');

console.log('\n=== Potential Issues ===');
console.log('1. If role is "NOT SET", the User document might not have a role field');
console.log('2. If user ID is undefined, the token might be malformed or the User lookup failed');
console.log('3. The User model has role enum: [\'user\', \'admin\', \'instructor\', \'teaching_assistant\', \'student\']');
console.log('4. Default role is \'instructor\'');

console.log('\n=== Recommendations ===');
console.log('1. Check if the user exists in the database');
console.log('2. Verify the token is being sent correctly in the request');
console.log('3. Add more logging to the /api/auth/me endpoint');
console.log('4. Check if the User document has all required fields');
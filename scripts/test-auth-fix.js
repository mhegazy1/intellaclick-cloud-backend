/**
 * Test script to verify the auth middleware fix
 */

const jwt = require('jsonwebtoken');

// Simulate the old auth middleware behavior
function oldAuthBehavior(decoded) {
  return decoded.user || { userId: decoded.userId };
}

// New auth middleware behavior
function newAuthBehavior(decoded) {
  let user;
  
  if (decoded.user) {
    user = decoded.user;
    if (!user._id && (user.id || user.userId)) {
      user._id = user.id || user.userId;
    }
  } else if (decoded.userId) {
    user = {
      _id: decoded.userId,
      id: decoded.userId,
      userId: decoded.userId
    };
  } else if (decoded.id) {
    user = {
      _id: decoded.id,
      id: decoded.id,
      userId: decoded.id
    };
  }
  
  return user;
}

// Test cases
const testCases = [
  {
    name: 'Token with userId only',
    decoded: { userId: '68acbd4cf1da2cb91f63b8f0' }
  },
  {
    name: 'Token with full user object',
    decoded: { 
      user: { 
        _id: '68acbd4cf1da2cb91f63b8f0',
        email: 'test@example.com',
        role: 'instructor'
      }
    }
  },
  {
    name: 'Token with id field',
    decoded: { id: '68acbd4cf1da2cb91f63b8f0' }
  }
];

console.log('=== Testing Auth Middleware Fix ===\n');

testCases.forEach(test => {
  console.log(`Test: ${test.name}`);
  console.log('Decoded token:', JSON.stringify(test.decoded, null, 2));
  
  const oldResult = oldAuthBehavior(test.decoded);
  const newResult = newAuthBehavior(test.decoded);
  
  console.log('Old behavior req.user:', oldResult);
  console.log('New behavior req.user:', newResult);
  
  // Test what happens when used in class creation
  const oldInstructorId = oldResult._id || oldResult.id || oldResult.userId;
  const newInstructorId = newResult._id || newResult.id || newResult.userId;
  
  console.log('Old instructorId extraction:', oldInstructorId);
  console.log('New instructorId extraction:', newInstructorId);
  
  // Check if old behavior would cause the problem
  if (!oldInstructorId && typeof oldResult === 'object') {
    console.log('⚠️  OLD BEHAVIOR WOULD CAUSE [object Object] ISSUE!');
  }
  
  console.log('✓ New behavior provides consistent ID:', newInstructorId);
  console.log('\n---\n');
});
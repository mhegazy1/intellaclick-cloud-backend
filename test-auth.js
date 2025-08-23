const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:5000';

async function testAuth() {
  console.log('Testing authentication flow...\n');
  
  // Test 1: Check health
  try {
    const health = await axios.get(`${API_URL}/health`);
    console.log('Health check:', health.data);
    console.log('Database status:', health.data.database);
    console.log('---\n');
  } catch (err) {
    console.error('Health check failed:', err.message);
    return;
  }
  
  // Test 2: Register a new user
  const testUser = {
    email: `test${Date.now()}@example.com`,
    password: 'testpassword123',
    firstName: 'Test',
    lastName: 'User'
  };
  
  console.log('Registering user:', testUser.email);
  try {
    const register = await axios.post(`${API_URL}/api/auth/register`, testUser);
    console.log('Registration successful:', register.data);
    console.log('---\n');
  } catch (err) {
    console.error('Registration failed:', err.response?.data || err.message);
    return;
  }
  
  // Test 3: Login with the same credentials
  console.log('Attempting login...');
  try {
    const login = await axios.post(`${API_URL}/api/auth/login`, {
      email: testUser.email,
      password: testUser.password
    });
    console.log('Login successful:', login.data);
    console.log('---\n');
  } catch (err) {
    console.error('Login failed:', err.response?.data || err.message);
    
    // Test 4: Debug password check
    if (process.env.NODE_ENV === 'development') {
      console.log('\nDebug password check...');
      try {
        const debug = await axios.post(`${API_URL}/api/auth/debug/test-password`, {
          email: testUser.email,
          password: testUser.password
        });
        console.log('Debug info:', debug.data);
      } catch (debugErr) {
        console.error('Debug failed:', debugErr.response?.data || debugErr.message);
      }
    }
  }
}

// Run the test
testAuth().catch(console.error);
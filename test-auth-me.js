const axios = require('axios');

// Test script for /api/auth/me endpoint
async function testAuthMe() {
  const API_URL = process.env.API_URL || 'http://localhost:5001';
  
  try {
    console.log('=== Testing /api/auth/me endpoint ===\n');
    
    // Step 1: Register or login to get a token
    console.log('1. Attempting to login...');
    const loginData = {
      email: process.argv[2] || 'test@example.com',
      password: process.argv[3] || 'password123'
    };
    
    let token;
    try {
      const loginResponse = await axios.post(`${API_URL}/api/auth/login`, loginData);
      token = loginResponse.data.token;
      console.log('Login successful!');
      console.log('User from login:', loginResponse.data.user);
    } catch (loginError) {
      if (loginError.response && loginError.response.status === 401) {
        console.log('Login failed, trying to register...');
        const registerData = {
          ...loginData,
          firstName: 'Test',
          lastName: 'User',
          role: 'instructor'
        };
        
        const registerResponse = await axios.post(`${API_URL}/api/auth/register`, registerData);
        token = registerResponse.data.token;
        console.log('Registration successful!');
        console.log('User from register:', registerResponse.data.user);
      } else {
        throw loginError;
      }
    }
    
    console.log('\nToken received:', token.substring(0, 20) + '...');
    
    // Step 2: Test /api/auth/me endpoint
    console.log('\n2. Testing /api/auth/me endpoint...');
    
    // Test with Authorization header
    try {
      const meResponse = await axios.get(`${API_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log('\nResponse from /api/auth/me (Authorization header):');
      console.log(JSON.stringify(meResponse.data, null, 2));
      
      // Check for issues
      if (meResponse.data.user) {
        const user = meResponse.data.user;
        console.log('\n=== User Details ===');
        console.log('ID:', user.id || 'UNDEFINED');
        console.log('Email:', user.email || 'UNDEFINED');
        console.log('Name:', user.name || 'UNDEFINED');
        console.log('Role:', user.role || 'NOT SET');
        
        if (!user.id || user.id === 'undefined') {
          console.log('\n⚠️  WARNING: User ID is undefined!');
        }
        if (!user.role || user.role === 'NOT SET') {
          console.log('\n⚠️  WARNING: User role is not set!');
        }
      }
    } catch (error) {
      console.error('Error with Authorization header:', error.response?.data || error.message);
    }
    
    // Test with x-auth-token header
    try {
      const meResponse2 = await axios.get(`${API_URL}/api/auth/me`, {
        headers: {
          'x-auth-token': token
        }
      });
      
      console.log('\nResponse from /api/auth/me (x-auth-token header):');
      console.log(JSON.stringify(meResponse2.data, null, 2));
    } catch (error) {
      console.error('Error with x-auth-token:', error.response?.data || error.message);
    }
    
    // Step 3: Decode the token to see what's inside
    console.log('\n3. Token payload:');
    const base64Payload = token.split('.')[1];
    const payload = Buffer.from(base64Payload, 'base64').toString();
    console.log(JSON.parse(payload));
    
  } catch (error) {
    console.error('\nError:', error.response?.data || error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
    }
  }
}

// Check if axios is installed
try {
  require.resolve('axios');
  testAuthMe();
} catch (e) {
  console.log('Please install axios first: npm install axios');
}
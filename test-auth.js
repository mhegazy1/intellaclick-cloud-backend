const axios = require('axios');

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:5000';
const TEST_USER = {
  email: 'test@example.com',
  password: 'password123',
  firstName: 'Test',
  lastName: 'User'
};

async function testAuth() {
  console.log('Testing Authentication Flow');
  console.log('API URL:', API_URL);
  console.log('----------------------------\n');

  try {
    // Test 1: Health Check
    console.log('1. Testing Health Check...');
    const healthRes = await axios.get(`${API_URL}/health`);
    console.log('Health Status:', healthRes.data);
    console.log('✓ Health check passed\n');

    // Test 2: Register
    console.log('2. Testing Registration...');
    let registerRes;
    try {
      registerRes = await axios.post(`${API_URL}/api/auth/register`, TEST_USER);
      console.log('Registration Response:', {
        success: registerRes.data.success,
        hasToken: !!registerRes.data.token,
        hasRefreshToken: !!registerRes.data.refreshToken,
        user: registerRes.data.user
      });
      console.log('✓ Registration successful\n');
    } catch (err) {
      if (err.response?.data?.error === 'User already exists') {
        console.log('User already exists, skipping to login...\n');
      } else {
        console.error('Registration Error:', err.response?.data || err.message);
        throw err;
      }
    }

    // Test 3: Login
    console.log('3. Testing Login...');
    const loginRes = await axios.post(`${API_URL}/api/auth/login`, {
      email: TEST_USER.email,
      password: TEST_USER.password
    });
    console.log('Login Response:', {
      success: loginRes.data.success,
      hasToken: !!loginRes.data.token,
      hasRefreshToken: !!loginRes.data.refreshToken,
      user: loginRes.data.user
    });
    const token = loginRes.data.token;
    console.log('✓ Login successful\n');

    // Test 4: Get user with x-auth-token header
    console.log('4. Testing /me endpoint with x-auth-token...');
    try {
      const meRes1 = await axios.get(`${API_URL}/api/auth/me`, {
        headers: { 'x-auth-token': token }
      });
      console.log('User data (x-auth-token):', meRes1.data);
      console.log('✓ /me endpoint with x-auth-token successful\n');
    } catch (err) {
      console.error('Error with x-auth-token:', err.response?.data || err.message);
    }

    // Test 5: Get user with Authorization Bearer header
    console.log('5. Testing /me endpoint with Authorization Bearer...');
    try {
      const meRes2 = await axios.get(`${API_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('User data (Bearer):', meRes2.data);
      console.log('✓ /me endpoint with Bearer token successful\n');
    } catch (err) {
      console.error('Error with Bearer token:', err.response?.data || err.message);
    }

    // Test 6: Test /user endpoint (alias)
    console.log('6. Testing /user endpoint (alias)...');
    try {
      const userRes = await axios.get(`${API_URL}/api/auth/user`, {
        headers: { 'x-auth-token': token }
      });
      console.log('User data (/user):', userRes.data);
      console.log('✓ /user endpoint successful\n');
    } catch (err) {
      console.error('Error with /user endpoint:', err.response?.data || err.message);
    }

    // Test 7: Test token refresh
    console.log('7. Testing token refresh...');
    if (loginRes.data.refreshToken) {
      try {
        const refreshRes = await axios.post(`${API_URL}/api/auth/refresh`, {
          refreshToken: loginRes.data.refreshToken
        });
        console.log('Refresh Response:', {
          success: refreshRes.data.success,
          hasNewToken: !!refreshRes.data.token,
          hasNewRefreshToken: !!refreshRes.data.refreshToken
        });
        console.log('✓ Token refresh successful\n');
      } catch (err) {
        console.error('Error with token refresh:', err.response?.data || err.message);
      }
    }

    console.log('All authentication tests completed!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

// Run the test
testAuth().catch(console.error);
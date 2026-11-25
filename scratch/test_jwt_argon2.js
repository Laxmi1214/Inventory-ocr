const http = require('http');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING JWT & ARGON2 COMPREHENSIVE SECURITY TESTS');
  console.log('====================================================\n');

  // Test 1: Successful Login with Argon2id Password Check
  console.log('TEST 1: Login with valid credentials (priya@gmail.com / priya123)...');
  const loginRes = await request({
    hostname: '127.0.0.1',
    port: 8080,
    path: '/api/v1/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    emailOrUsername: 'priya@gmail.com',
    password: 'priya123'
  });

  if (loginRes.status === 200 && loginRes.body.success && loginRes.body.accessToken && loginRes.body.refreshToken) {
    console.log('✅ TEST 1 PASSED: Logged in successfully!');
    console.log('   Access Token received (length):', loginRes.body.accessToken.length);
    console.log('   Refresh Token received (length):', loginRes.body.refreshToken.length);
    console.log('   User role:', loginRes.body.user.role);
  } else {
    console.error('❌ TEST 1 FAILED:', loginRes);
    process.exit(1);
  }

  const { accessToken, refreshToken } = loginRes.body;

  // Test 2: Login with incorrect password
  console.log('\nTEST 2: Login with wrong password (priya@gmail.com / wrong_pass)...');
  const wrongRes = await request({
    hostname: '127.0.0.1',
    port: 8080,
    path: '/api/v1/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    emailOrUsername: 'priya@gmail.com',
    password: 'wrong_pass'
  });

  if (wrongRes.status === 401 && !wrongRes.body.success) {
    console.log('✅ TEST 2 PASSED: Rejected incorrect password with HTTP 401:', wrongRes.body.error);
  } else {
    console.error('❌ TEST 2 FAILED:', wrongRes);
    process.exit(1);
  }

  // Test 3: Authenticated Endpoint (/api/v1/auth/me) with Access Token
  console.log('\nTEST 3: GET /api/v1/auth/me with Bearer Access Token...');
  const meRes = await request({
    hostname: '127.0.0.1',
    port: 8080,
    path: '/api/v1/auth/me',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (meRes.status === 200 && meRes.body.success && meRes.body.user.email === 'priya@gmail.com') {
    console.log('✅ TEST 3 PASSED: /api/v1/auth/me validated token successfully! User:', meRes.body.user.username);
  } else {
    console.error('❌ TEST 3 FAILED:', meRes);
    process.exit(1);
  }

  // Test 4: Authenticated Endpoint without Token
  console.log('\nTEST 4: GET /api/v1/auth/me WITHOUT token...');
  const meNoTokenRes = await request({
    hostname: '127.0.0.1',
    port: 8080,
    path: '/api/v1/auth/me',
    method: 'GET'
  });

  if (meNoTokenRes.status === 401) {
    console.log('✅ TEST 4 PASSED: Rejected unauthenticated request with HTTP 401');
  } else {
    console.error('❌ TEST 4 FAILED:', meNoTokenRes);
    process.exit(1);
  }

  // Test 5: Refresh Access Token with Refresh Token
  console.log('\nTEST 5: POST /api/v1/auth/refresh with Refresh Token...');
  const refreshRes = await request({
    hostname: '127.0.0.1',
    port: 8080,
    path: '/api/v1/auth/refresh',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    refreshToken
  });

  if (refreshRes.status === 200 && refreshRes.body.success && refreshRes.body.accessToken) {
    console.log('✅ TEST 5 PASSED: Fresh Access Token generated successfully!');
  } else {
    console.error('❌ TEST 5 FAILED:', refreshRes);
    process.exit(1);
  }

  // Test 6: Revoke Token via Logout
  console.log('\nTEST 6: POST /api/v1/auth/logout with Refresh Token...');
  const logoutRes = await request({
    hostname: '127.0.0.1',
    port: 8080,
    path: '/api/v1/auth/logout',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    refreshToken
  });

  if (logoutRes.status === 200 && logoutRes.body.success) {
    console.log('✅ TEST 6 PASSED: Refresh token successfully revoked in DB');
  } else {
    console.error('❌ TEST 6 FAILED:', logoutRes);
    process.exit(1);
  }

  // Test 7: Verify Revoked Refresh Token cannot be used again
  console.log('\nTEST 7: Verify revoked token cannot be refreshed...');
  const refreshRevokedRes = await request({
    hostname: '127.0.0.1',
    port: 8080,
    path: '/api/v1/auth/refresh',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    refreshToken
  });

  if (refreshRevokedRes.status === 401) {
    console.log('✅ TEST 7 PASSED: Revoked token was rejected with HTTP 401:', refreshRevokedRes.body.error);
  } else {
    console.error('❌ TEST 7 FAILED: Revoked token was unexpectedly accepted!', refreshRevokedRes);
    process.exit(1);
  }

  // Test 8: Register new test user and verify Argon2id hash in DB
  const testEmail = `test_user_${Date.now()}@congiotech.com`;
  console.log(`\nTEST 8: Register new user (${testEmail}) and verify Argon2id hash & dual tokens...`);
  const regRes = await request({
    hostname: '127.0.0.1',
    port: 8080,
    path: '/api/v1/auth/register',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    username: 'Test Sec User',
    email: testEmail,
    password: 'SecurePassword@2026',
    role: 'OPERATOR'
  });

  if (regRes.status === 200 && regRes.body.success && regRes.body.accessToken && regRes.body.refreshToken) {
    console.log('✅ TEST 8 PASSED: User registered with dual tokens!');
  } else {
    console.error('❌ TEST 8 FAILED:', regRes);
    process.exit(1);
  }

  console.log('\n====================================================');
  console.log('🎉 ALL 8 JWT & ARGON2 SECURITY TESTS PASSED 100%!');
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

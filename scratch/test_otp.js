async function testOtpFlow() {
  try {
    // 1. Request OTP
    const res1 = await fetch('http://127.0.0.1:8080/api/v1/auth/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'operator@congiotech.com' })
    });
    const json1 = await res1.json();
    console.log('OTP Request Response:', json1);

    if (json1.success && json1.otp) {
      // 2. Reset Password using OTP
      const res2 = await fetch('http://127.0.0.1:8080/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'operator@congiotech.com',
          otp: json1.otp,
          newPassword: 'password123'
        })
      });
      const json2 = await res2.json();
      console.log('Password Reset Response:', json2);
    }
  } catch (err) {
    console.error('OTP test error:', err);
  }
}
testOtpFlow();

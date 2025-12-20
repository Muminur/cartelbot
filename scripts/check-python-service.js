const axios = require('axios');

const PYTHON_SERVICE_URL = process.env.DISCORD_PYTHON_SERVICE_URL || 'http://localhost:8000';

async function checkService() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║        PYTHON DISCORD SERVICE DIAGNOSTIC CHECK                 ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  console.log('Service URL:', PYTHON_SERVICE_URL);
  console.log('');

  // 1. Check if service is running
  console.log('1. Checking if service is running...');
  try {
    const response = await axios.get(`${PYTHON_SERVICE_URL}/health`, {
      timeout: 5000
    });
    console.log('   ✅ Service is running');
    console.log('   Status:', response.data.status);
    console.log('   Active clients:', response.data.active_clients || 0);
    console.log('   Max clients:', response.data.max_clients || 10);
    console.log('   Uptime:', response.data.uptime || 'N/A', 'seconds');
    console.log('');
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('   ❌ Service is NOT running');
      console.log('   Error: Connection refused to', PYTHON_SERVICE_URL);
      console.log('');
      console.log('💡 To start the Python service:');
      console.log('   1. cd services/discord-selfbot');
      console.log('   2. python -m venv venv');
      console.log('   3. venv\\Scripts\\activate (Windows) or source venv/bin/activate (Mac/Linux)');
      console.log('   4. pip install -r requirements.txt');
      console.log('   5. python main.py');
      console.log('');
      console.log('   OR use the start.bat script:');
      console.log('   cd services/discord-selfbot && start.bat');
      process.exit(1);
    }
    console.log('   ❌ Error checking service:', error.message);
    process.exit(1);
  }

  // 2. Check current client status
  console.log('2. Checking current active clients...');
  try {
    const response = await axios.get(`${PYTHON_SERVICE_URL}/client/status`, {
      timeout: 5000
    });
    console.log('   ✅ Client status endpoint accessible');
    if (response.data.data && typeof response.data.data === 'object') {
      const clients = Object.keys(response.data.data);
      console.log('   Active clients:', clients.length);
      if (clients.length > 0) {
        console.log('   Client IDs:');
        clients.forEach(clientId => {
          console.log('     -', clientId);
        });
      }
    }
    console.log('');
  } catch (error) {
    console.log('   ⚠️  Could not get client status:', error.message);
    console.log('');
  }

  // 3. Test token validation endpoint
  console.log('3. Testing token validation endpoint...');
  try {
    const response = await axios.post(
      `${PYTHON_SERVICE_URL}/token/validate`,
      { token: 'test_token_too_short' },
      { timeout: 5000, validateStatus: () => true }
    );
    if (response.status === 400 || response.data.success === false) {
      console.log('   ✅ Token validation endpoint working (correctly rejected invalid token)');
    } else {
      console.log('   ⚠️  Unexpected response:', response.data);
    }
    console.log('');
  } catch (error) {
    console.log('   ❌ Token validation endpoint error:', error.message);
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Diagnostic check complete!');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

checkService().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

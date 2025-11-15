/**
 * MongoDB Connection Diagnostic Script
 * Tests connection to MongoDB server at 66.179.240.208:5999
 */

const mongoose = require('mongoose');

const MONGODB_HOST = '66.179.240.208';
const MONGODB_PORT = 5999;

console.log('=== MongoDB Connection Diagnostic ===\n');
console.log(`Target: ${MONGODB_HOST}:${MONGODB_PORT}\n`);

// Test 1: TCP Connection Test (using net module)
console.log('[Test 1] Testing TCP connectivity...');
const net = require('net');

const tcpTest = new Promise((resolve) => {
  const socket = new net.Socket();
  const timeout = setTimeout(() => {
    socket.destroy();
    console.log('❌ TCP Connection: TIMEOUT (server not reachable on port 5999)');
    resolve(false);
  }, 10000);

  socket.connect(MONGODB_PORT, MONGODB_HOST, () => {
    clearTimeout(timeout);
    console.log('✅ TCP Connection: SUCCESS (port 5999 is open)');
    socket.destroy();
    resolve(true);
  });

  socket.on('error', (err) => {
    clearTimeout(timeout);
    console.log(`❌ TCP Connection: ERROR - ${err.message}`);
    resolve(false);
  });
});

// Test 2: Mongoose Connection Test
async function testMongooseConnection() {
  console.log('\n[Test 2] Testing Mongoose connection...');

  // Try to read connection string from .env if available
  let connectionString;
  try {
    require('dotenv').config();
    connectionString = process.env.DATABASE_URL;
    console.log(`Connection string found in .env: ${connectionString ? 'YES' : 'NO'}`);
  } catch (err) {
    console.log('Note: .env file not loaded (this is okay if testing manually)');
  }

  // Fallback to manual construction if .env not available
  if (!connectionString) {
    connectionString = `mongodb://${MONGODB_HOST}:${MONGODB_PORT}/cartelbot?directConnection=true`;
    console.log('Using manual connection string (no auth)');
  }

  const options = {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 10000,
    family: 4, // Use IPv4
  };

  try {
    console.log('Attempting Mongoose connection...');
    await mongoose.connect(connectionString, options);
    console.log('✅ Mongoose Connection: SUCCESS');
    console.log('Connection state:', mongoose.connection.readyState); // 1 = connected

    // List databases to verify full connectivity
    const admin = mongoose.connection.db.admin();
    const { databases } = await admin.listDatabases();
    console.log(`\nAvailable databases: ${databases.map(db => db.name).join(', ')}`);

    await mongoose.disconnect();
    return true;
  } catch (err) {
    console.log(`❌ Mongoose Connection: ERROR - ${err.message}`);
    console.log('Error code:', err.code);
    return false;
  }
}

// Run all tests
async function runDiagnostics() {
  const tcpSuccess = await tcpTest;

  if (!tcpSuccess) {
    console.log('\n=== DIAGNOSIS ===');
    console.log('TCP connection failed. This indicates:');
    console.log('1. MongoDB server is down, OR');
    console.log('2. Firewall is blocking port 5999, OR');
    console.log('3. Network routing issue');
    console.log('\n=== RECOMMENDED ACTIONS ===');
    console.log('1. Check if MongoDB is running on the VPS:');
    console.log('   ssh user@66.179.240.208');
    console.log('   sudo systemctl status mongod');
    console.log('');
    console.log('2. Check firewall (IONOS/VPS):');
    console.log('   - IONOS Control Panel > Network > Firewall');
    console.log('   - Ensure port 5999 is open for incoming connections');
    console.log('');
    console.log('3. Check MongoDB is listening on correct port:');
    console.log('   sudo netstat -tuln | grep 5999');
    process.exit(1);
  }

  const mongooseSuccess = await testMongooseConnection();

  if (!mongooseSuccess) {
    console.log('\n=== DIAGNOSIS ===');
    console.log('TCP connection works, but Mongoose connection failed.');
    console.log('This indicates:');
    console.log('1. MongoDB is not running on port 5999, OR');
    console.log('2. Authentication credentials are incorrect, OR');
    console.log('3. MongoDB is configured to reject connections');
    console.log('\n=== RECOMMENDED ACTIONS ===');
    console.log('1. Verify MongoDB configuration:');
    console.log('   cat /etc/mongod.conf | grep port');
    console.log('   cat /etc/mongod.conf | grep bindIp');
    console.log('');
    console.log('2. Check MongoDB logs:');
    console.log('   sudo tail -f /var/log/mongodb/mongod.log');
    process.exit(1);
  }

  console.log('\n=== ALL TESTS PASSED ===');
  console.log('MongoDB connection is working correctly!');
  process.exit(0);
}

runDiagnostics().catch(err => {
  console.error('Diagnostic script error:', err);
  process.exit(1);
});

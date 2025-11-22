/**
 * Generate a test session token for development/testing
 *
 * Usage: node scripts/generate-test-session.js
 */

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Read environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};

envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const value = match[2].trim();
    envVars[key] = value;
  }
});

const DATABASE_URL = envVars.DATABASE_URL;
const JWT_SECRET = envVars.JWT_SECRET;

if (!DATABASE_URL || !JWT_SECRET) {
  console.error('ERROR: DATABASE_URL or JWT_SECRET not found in .env.local');
  process.exit(1);
}

async function main() {
  console.log('🔐 Generating test session token...\n');

  try {
    // Connect to MongoDB
    await mongoose.connect(DATABASE_URL, {
      dbName: 'cartelbot',
      serverSelectionTimeoutMS: 5000,
    });

    const db = mongoose.connection.db;

    // Find test user
    const testUser = await db.collection('users').findOne({
      email: 'test@cartelbot.coinspree.cc'
    });

    if (!testUser) {
      console.error('❌ Test user not found. Run populate-test-data.js first!');
      process.exit(1);
    }

    const userId = testUser._id.toString();
    const email = testUser.email;

    console.log('✅ Found test user:');
    console.log(`   Email: ${email}`);
    console.log(`   User ID: ${userId}\n`);

    // Generate session token (7 days)
    const sessionToken = jwt.sign(
      {
        userId,
        email,
        type: 'session'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('🎫 Session Token Generated:\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(sessionToken);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📋 How to use this token:\n');
    console.log('1. Open Developer Tools in your browser (F12)');
    console.log('2. Go to the Application/Storage tab');
    console.log('3. Click on Cookies → http://localhost:3001');
    console.log('4. Add a new cookie with:');
    console.log('   Name: session');
    console.log('   Value: <paste the token above>');
    console.log('   Path: /');
    console.log('   HttpOnly: true');
    console.log('   Secure: false (for localhost)\n');
    console.log('5. Refresh the page - you should be logged in!\n');

    console.log('🚀 Or use this curl command to test API endpoints:\n');
    console.log(`curl -H "Cookie: session=${sessionToken}" http://localhost:3001/api/stats\n`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

main();

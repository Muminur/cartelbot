/**
 * Create Test User and Session for Playwright Testing
 *
 * Usage: node scripts/create-test-session.js
 *
 * Creates a test user with API keys and returns a valid session token
 * that can be used by Playwright for authenticated testing.
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
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
const ENCRYPTION_KEY = envVars.ENCRYPTION_KEY;
const JWT_SECRET = envVars.JWT_SECRET;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not found in .env.local');
  process.exit(1);
}

if (!ENCRYPTION_KEY) {
  console.error('ERROR: ENCRYPTION_KEY not found in .env.local');
  process.exit(1);
}

if (!JWT_SECRET) {
  console.error('ERROR: JWT_SECRET not found in .env.local');
  process.exit(1);
}

// AES-256-GCM encryption for API keys
function encryptApiKey(apiKey) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);

  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    encryptedData: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

// Generate session token (matches lib/auth/jwt.ts)
function generateSessionToken(userId, email) {
  return jwt.sign(
    { userId, email, type: 'session' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

async function main() {
  console.log('🧪 Creating test user for Playwright testing...\n');

  try {
    // Connect to MongoDB
    console.log('📊 Connecting to MongoDB...');
    await mongoose.connect(DATABASE_URL, {
      dbName: 'cartelbot',
      serverSelectionTimeoutMS: 10000,
    });
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // Test user details
    const testEmail = 'playwright-test@cartelbot.local';
    const userId = new mongoose.Types.ObjectId();

    // Check if test user already exists
    let existingUser = await db.collection('users').findOne({ email: testEmail });

    if (existingUser) {
      console.log('📧 Test user already exists, updating...');
      // Update existing user
      await db.collection('users').updateOne(
        { email: testEmail },
        {
          $set: {
            useTestnet: true,
            updatedAt: new Date(),
          }
        }
      );
      existingUser = await db.collection('users').findOne({ email: testEmail });
    } else {
      // Create Binance Testnet API keys (use testnet credentials)
      // These are placeholder test keys - for real testing, use actual testnet keys
      const testApiKey = 'testnet_api_key_for_playwright_' + crypto.randomBytes(8).toString('hex');
      const testApiSecret = 'testnet_api_secret_for_playwright_' + crypto.randomBytes(16).toString('hex');

      const encryptedKey = encryptApiKey(testApiKey);
      const encryptedSecret = encryptApiKey(testApiSecret);

      // Create test user
      console.log('👤 Creating test user...');
      await db.collection('users').insertOne({
        _id: userId,
        email: testEmail,
        binanceApiKey: encryptedKey,
        binanceApiSecret: encryptedSecret,
        useTestnet: true,
        isActive: true,
        subscriptionTier: 'pro',
        subscriptionExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      existingUser = await db.collection('users').findOne({ email: testEmail });
    }

    // Generate session token
    const sessionToken = generateSessionToken(
      existingUser._id.toString(),
      existingUser.email
    );

    // Output results
    console.log('\n✅ Test user ready!\n');
    console.log('==========================================');
    console.log('📧 Email:', testEmail);
    console.log('🆔 User ID:', existingUser._id.toString());
    console.log('🌐 Testnet:', existingUser.useTestnet ? 'Yes' : 'No');
    console.log('==========================================\n');

    console.log('🔐 Session Token (for Playwright cookie):');
    console.log('==========================================');
    console.log(sessionToken);
    console.log('==========================================\n');

    // Write session info to a JSON file for Playwright to use
    const sessionInfo = {
      userId: existingUser._id.toString(),
      email: testEmail,
      sessionToken: sessionToken,
      cookieName: 'session',
      useTestnet: true,
    };

    const outputPath = path.join(__dirname, '..', 'playwright', '.auth', 'test-session.json');
    const authDir = path.dirname(outputPath);

    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(sessionInfo, null, 2));
    console.log(`📁 Session info saved to: ${outputPath}\n`);

    console.log('🎭 Usage in Playwright:');
    console.log('  await context.addCookies([{');
    console.log('    name: "session",');
    console.log(`    value: "${sessionToken.substring(0, 20)}...",`);
    console.log('    domain: "localhost",');
    console.log('    path: "/"');
    console.log('  }]);');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Database connection closed');
  }
}

main();

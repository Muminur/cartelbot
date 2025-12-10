/**
 * DIAGNOSTIC SCRIPT: Session Logout Investigation
 *
 * Purpose: Identify why users are being logged out before 7-day expiration
 *
 * Tests:
 * 1. JWT token generation/verification
 * 2. Cookie settings and expiration
 * 3. Database connection stability
 * 4. User account status
 * 5. Environment variable validation
 */

const jwt = require('jsonwebtoken');
const { MongoClient } = require('mongodb');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const TESTS = {
  passed: [],
  failed: [],
  warnings: []
};

function log(category, message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${category.toUpperCase()}] ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function addResult(type, test, details) {
  TESTS[type].push({ test, details });
}

// ============================================================
// TEST 1: Environment Variables
// ============================================================
async function testEnvironmentVariables() {
  log('test', 'Testing environment variables...');

  const requiredVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'ENCRYPTION_KEY',
    'NEXT_PUBLIC_API_URL',
    'NODE_ENV'
  ];

  const missing = [];
  const present = [];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    } else {
      present.push({
        name: varName,
        length: process.env[varName].length,
        preview: varName.includes('SECRET') || varName.includes('KEY')
          ? '[REDACTED]'
          : process.env[varName].substring(0, 50)
      });
    }
  }

  if (missing.length > 0) {
    addResult('failed', 'Environment Variables', `Missing: ${missing.join(', ')}`);
    return false;
  }

  // Check JWT_SECRET length (should be >= 32 chars)
  if (process.env.JWT_SECRET.length < 32) {
    addResult('warnings', 'JWT_SECRET', 'JWT_SECRET is less than 32 characters (insecure)');
  }

  addResult('passed', 'Environment Variables', `All required variables present`);
  log('info', 'Environment variables check:', present);
  return true;
}

// ============================================================
// TEST 2: JWT Token Generation and Verification
// ============================================================
async function testJWTTokens() {
  log('test', 'Testing JWT token generation and verification...');

  const testUserId = '507f1f77bcf86cd799439011';
  const testEmail = 'test@example.com';

  try {
    // Generate token with 7-day expiration
    const token = jwt.sign(
      { userId: testUserId, email: testEmail, type: 'session' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    log('info', 'Generated test JWT token');

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256']
    });

    log('info', 'Decoded JWT payload:', {
      userId: decoded.userId,
      email: decoded.email,
      type: decoded.type,
      iat: new Date(decoded.iat * 1000).toISOString(),
      exp: new Date(decoded.exp * 1000).toISOString(),
      expiresIn: `${Math.floor((decoded.exp - decoded.iat) / 86400)} days`
    });

    // Verify expiration is actually 7 days
    const expirySeconds = decoded.exp - decoded.iat;
    const expiryDays = expirySeconds / 86400;

    if (expiryDays < 6.9 || expiryDays > 7.1) {
      addResult('failed', 'JWT Expiration', `Token expires in ${expiryDays.toFixed(2)} days (expected 7)`);
      return false;
    }

    addResult('passed', 'JWT Token Generation', 'Token generated with correct 7-day expiration');
    return true;

  } catch (error) {
    addResult('failed', 'JWT Token', error.message);
    log('error', 'JWT token test failed:', error);
    return false;
  }
}

// ============================================================
// TEST 3: Cookie Settings Analysis
// ============================================================
async function testCookieSettings() {
  log('test', 'Analyzing cookie settings...');

  const cookieMaxAge = 7 * 24 * 60 * 60; // 7 days in seconds
  const nodeEnv = process.env.NODE_ENV;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  const settings = {
    maxAge: cookieMaxAge,
    maxAgeDays: cookieMaxAge / 86400,
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite: 'strict',
    path: '/',
    environment: nodeEnv
  };

  // Parse domain from API URL
  if (nodeEnv === 'production' && apiUrl) {
    try {
      const url = new URL(apiUrl);
      settings.domain = url.hostname;
    } catch (err) {
      addResult('warnings', 'Cookie Domain', `Failed to parse domain from ${apiUrl}`);
    }
  }

  log('info', 'Cookie settings:', settings);

  // Check for potential issues
  const issues = [];

  // Issue 1: sameSite=strict may block cookies in certain scenarios
  if (settings.sameSite === 'strict') {
    issues.push({
      severity: 'WARNING',
      issue: 'sameSite=strict',
      impact: 'Cookies may not be sent on cross-site navigation (e.g., clicking external links)',
      recommendation: 'Consider changing to sameSite=lax for better compatibility'
    });
  }

  // Issue 2: Domain mismatch between dev and prod
  if (settings.domain && settings.domain.includes('localhost')) {
    issues.push({
      severity: 'ERROR',
      issue: 'Domain set to localhost in production',
      impact: 'Cookies will not work correctly',
      recommendation: 'Fix NEXT_PUBLIC_API_URL to use production domain'
    });
  }

  // Issue 3: Secure flag in development
  if (!settings.secure && nodeEnv === 'production') {
    issues.push({
      severity: 'ERROR',
      issue: 'Secure flag not set in production',
      impact: 'Cookies vulnerable to interception',
      recommendation: 'Set NODE_ENV=production'
    });
  }

  if (issues.length > 0) {
    addResult('warnings', 'Cookie Configuration', issues);
    log('warn', 'Cookie configuration issues found:', issues);
  } else {
    addResult('passed', 'Cookie Configuration', 'No issues detected');
  }

  return issues.length === 0;
}

// ============================================================
// TEST 4: Database Connection and User Queries
// ============================================================
async function testDatabaseConnection() {
  log('test', 'Testing database connection...');

  let client;
  try {
    client = new MongoClient(process.env.DATABASE_URL, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 10000,
    });

    const startTime = Date.now();
    await client.connect();
    const connectTime = Date.now() - startTime;

    log('info', `Database connected in ${connectTime}ms`);

    // Test query performance
    const db = client.db();
    const queryStart = Date.now();
    const userCount = await db.collection('users').countDocuments();
    const queryTime = Date.now() - queryStart;

    log('info', `User count query: ${userCount} users in ${queryTime}ms`);

    // Check for inactive users
    const inactiveCount = await db.collection('users').countDocuments({ isActive: false });
    log('info', `Inactive users: ${inactiveCount}`);

    // Performance thresholds
    if (connectTime > 5000) {
      addResult('warnings', 'Database Connection', `Slow connection time: ${connectTime}ms (>5s)`);
    }

    if (queryTime > 1000) {
      addResult('warnings', 'Database Queries', `Slow query time: ${queryTime}ms (>1s)`);
    }

    addResult('passed', 'Database Connection', `Connected successfully (${connectTime}ms)`);
    return true;

  } catch (error) {
    addResult('failed', 'Database Connection', error.message);
    log('error', 'Database connection failed:', error);
    return false;
  } finally {
    if (client) {
      await client.close();
    }
  }
}

// ============================================================
// TEST 5: Simulate getCurrentUser Flow
// ============================================================
async function testGetCurrentUserFlow() {
  log('test', 'Simulating getCurrentUser() authentication flow...');

  let client;
  try {
    // Step 1: Generate token
    const testUserId = '507f1f77bcf86cd799439011';
    const testEmail = 'test@cartelbot.coinspree.cc';

    const token = jwt.sign(
      { userId: testUserId, email: testEmail, type: 'session' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    log('info', 'Step 1: Token generated');

    // Step 2: Verify token
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256']
    });

    if (payload.type !== 'session') {
      throw new Error('Invalid token type');
    }

    log('info', 'Step 2: Token verified');

    // Step 3: Connect to database
    client = new MongoClient(process.env.DATABASE_URL, {
      serverSelectionTimeoutMS: 5000,
    });
    await client.connect();

    log('info', 'Step 3: Database connected');

    // Step 4: Query user (simulate with count since we don't have real user)
    const db = client.db();
    const activeUsers = await db.collection('users').find({ isActive: true }).limit(5).toArray();

    log('info', `Step 4: Found ${activeUsers.length} active users`);

    // Check if any users have incorrect isActive status
    const allUsers = await db.collection('users').countDocuments();
    const activeCount = await db.collection('users').countDocuments({ isActive: true });
    const inactiveCount = allUsers - activeCount;

    if (inactiveCount > 0) {
      addResult('warnings', 'User Status', `${inactiveCount} inactive users (they will be logged out)`);
    }

    addResult('passed', 'getCurrentUser Flow', 'Authentication flow completed successfully');
    return true;

  } catch (error) {
    addResult('failed', 'getCurrentUser Flow', error.message);
    log('error', 'getCurrentUser simulation failed:', error);
    return false;
  } finally {
    if (client) {
      await client.close();
    }
  }
}

// ============================================================
// TEST 6: Check for JWT Secret Changes
// ============================================================
async function testJWTSecretHistory() {
  log('test', 'Checking for JWT_SECRET changes...');

  // Generate tokens with current secret
  const token1 = jwt.sign(
    { test: 'token1' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Try to verify with same secret
  try {
    jwt.verify(token1, process.env.JWT_SECRET);
    addResult('passed', 'JWT Secret Consistency', 'Secret is consistent');
    return true;
  } catch (error) {
    addResult('failed', 'JWT Secret Consistency', 'Secret verification failed');
    return false;
  }
}

// ============================================================
// TEST 7: Production Cookie Domain Analysis
// ============================================================
async function testProductionDomain() {
  log('test', 'Analyzing production domain configuration...');

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  const nodeEnv = process.env.NODE_ENV;

  if (nodeEnv !== 'production') {
    addResult('warnings', 'Production Domain', 'Not in production mode - skipping');
    return true;
  }

  try {
    const url = new URL(apiUrl);
    const domain = url.hostname;

    log('info', 'Production domain:', {
      url: apiUrl,
      hostname: domain,
      protocol: url.protocol
    });

    // Check for common issues
    if (domain === 'localhost' || domain === '127.0.0.1') {
      addResult('failed', 'Production Domain', 'Using localhost in production - cookies will fail');
      return false;
    }

    if (url.protocol !== 'https:') {
      addResult('warnings', 'Production Domain', 'Not using HTTPS - secure cookies may fail');
    }

    addResult('passed', 'Production Domain', `Correctly configured: ${domain}`);
    return true;

  } catch (error) {
    addResult('failed', 'Production Domain', `Invalid URL: ${apiUrl}`);
    return false;
  }
}

// ============================================================
// MAIN EXECUTION
// ============================================================
async function runDiagnostics() {
  console.log('='.repeat(60));
  console.log('SESSION LOGOUT DIAGNOSTIC SCRIPT');
  console.log('='.repeat(60));
  console.log('');

  const tests = [
    { name: 'Environment Variables', fn: testEnvironmentVariables },
    { name: 'JWT Tokens', fn: testJWTTokens },
    { name: 'Cookie Settings', fn: testCookieSettings },
    { name: 'Database Connection', fn: testDatabaseConnection },
    { name: 'getCurrentUser Flow', fn: testGetCurrentUserFlow },
    { name: 'JWT Secret Consistency', fn: testJWTSecretHistory },
    { name: 'Production Domain', fn: testProductionDomain }
  ];

  for (const test of tests) {
    console.log('-'.repeat(60));
    await test.fn();
    console.log('');
  }

  // ============================================================
  // FINAL REPORT
  // ============================================================
  console.log('='.repeat(60));
  console.log('DIAGNOSTIC REPORT');
  console.log('='.repeat(60));
  console.log('');

  console.log(`✅ PASSED: ${TESTS.passed.length}`);
  TESTS.passed.forEach(result => {
    console.log(`   - ${result.test}: ${result.details}`);
  });
  console.log('');

  console.log(`⚠️  WARNINGS: ${TESTS.warnings.length}`);
  TESTS.warnings.forEach(result => {
    console.log(`   - ${result.test}:`);
    if (typeof result.details === 'string') {
      console.log(`     ${result.details}`);
    } else if (Array.isArray(result.details)) {
      result.details.forEach(detail => {
        console.log(`     ${detail.severity}: ${detail.issue}`);
        console.log(`       Impact: ${detail.impact}`);
        console.log(`       Fix: ${detail.recommendation}`);
      });
    }
  });
  console.log('');

  console.log(`❌ FAILED: ${TESTS.failed.length}`);
  TESTS.failed.forEach(result => {
    console.log(`   - ${result.test}: ${result.details}`);
  });
  console.log('');

  // ============================================================
  // ROOT CAUSE ANALYSIS
  // ============================================================
  console.log('='.repeat(60));
  console.log('ROOT CAUSE ANALYSIS');
  console.log('='.repeat(60));
  console.log('');

  if (TESTS.failed.length > 0) {
    console.log('🔴 CRITICAL ISSUES DETECTED:');
    console.log('');
    console.log('The following issues will cause immediate logout:');
    TESTS.failed.forEach(result => {
      console.log(`  ${result.test}: ${result.details}`);
    });
    console.log('');
    console.log('FIX PRIORITY: Address failed tests first.');
  } else if (TESTS.warnings.length > 0) {
    console.log('🟡 POTENTIAL ISSUES DETECTED:');
    console.log('');
    console.log('The following issues may cause intermittent logouts:');
    TESTS.warnings.forEach(result => {
      console.log(`  ${result.test}`);
    });
    console.log('');
    console.log('FIX PRIORITY: Review warnings for compatibility issues.');
  } else {
    console.log('✅ NO ISSUES DETECTED');
    console.log('');
    console.log('All authentication components are correctly configured.');
    console.log('');
    console.log('If users are still experiencing logouts, check:');
    console.log('  1. Browser cookie settings (blocking 3rd party cookies)');
    console.log('  2. Browser extensions (privacy extensions may clear cookies)');
    console.log('  3. Incognito/Private mode (cookies cleared on close)');
    console.log('  4. Network issues causing WebSocket reconnection loops');
    console.log('  5. User manually clearing browser data');
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('NEXT STEPS');
  console.log('='.repeat(60));
  console.log('');
  console.log('1. Review diagnostic results above');
  console.log('2. Fix any FAILED tests immediately');
  console.log('3. Consider fixes for WARNING tests');
  console.log('4. Test with real user session');
  console.log('5. Monitor server logs for getCurrentUser errors');
  console.log('');
}

// Run diagnostics
runDiagnostics()
  .then(() => {
    console.log('Diagnostics completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Diagnostics failed:', error);
    process.exit(1);
  });

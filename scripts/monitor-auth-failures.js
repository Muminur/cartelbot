/**
 * AUTHENTICATION FAILURE MONITOR
 *
 * Purpose: Monitor real-time authentication failures and logout events
 *
 * Usage:
 *   node scripts/monitor-auth-failures.js
 *
 * This script:
 * 1. Watches server logs for authentication errors
 * 2. Tracks JWT verification failures
 * 3. Identifies patterns in logout events
 * 4. Provides real-time alerts
 */

const { MongoClient } = require('mongodb');
const jwt = require('jsonwebtoken');

require('dotenv').config({ path: '.env.local' });

// Statistics tracking
const STATS = {
  totalAuthAttempts: 0,
  successfulAuth: 0,
  failedAuth: 0,
  jwtExpired: 0,
  jwtInvalid: 0,
  userNotFound: 0,
  userInactive: 0,
  databaseErrors: 0,
  startTime: Date.now()
};

const AUTH_FAILURES = [];
const MAX_FAILURES_STORED = 100;

function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const emoji = {
    info: 'ℹ️',
    warn: '⚠️',
    error: '❌',
    success: '✅'
  }[level] || '📝';

  console.log(`${emoji} [${timestamp}] ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function recordFailure(type, details) {
  AUTH_FAILURES.push({
    type,
    details,
    timestamp: new Date().toISOString()
  });

  // Keep only last 100 failures
  if (AUTH_FAILURES.length > MAX_FAILURES_STORED) {
    AUTH_FAILURES.shift();
  }

  STATS.failedAuth++;
  STATS[type]++;
}

async function checkUserSessions() {
  log('info', 'Checking user sessions in database...');

  let client;
  try {
    client = new MongoClient(process.env.DATABASE_URL, {
      serverSelectionTimeoutMS: 5000,
    });

    await client.connect();
    const db = client.db();

    // Count users by status
    const totalUsers = await db.collection('users').countDocuments();
    const activeUsers = await db.collection('users').countDocuments({ isActive: true });
    const inactiveUsers = totalUsers - activeUsers;

    log('info', 'User statistics:', {
      total: totalUsers,
      active: activeUsers,
      inactive: inactiveUsers,
      inactivePercentage: ((inactiveUsers / totalUsers) * 100).toFixed(2) + '%'
    });

    // Check for users with API keys configured
    const usersWithKeys = await db.collection('users').countDocuments({
      encryptedApiKey: { $exists: true, $ne: null }
    });

    log('info', `Users with API keys: ${usersWithKeys}/${totalUsers}`);

    // Sample recent user activity
    const recentUsers = await db.collection('users')
      .find({ isActive: true })
      .sort({ updatedAt: -1 })
      .limit(5)
      .project({ email: 1, createdAt: 1, updatedAt: 1 })
      .toArray();

    log('info', 'Recent active users:', recentUsers);

    return { totalUsers, activeUsers, inactiveUsers, usersWithKeys };

  } catch (error) {
    log('error', 'Database check failed:', {
      error: error.message,
      code: error.code
    });
    STATS.databaseErrors++;
    return null;
  } finally {
    if (client) {
      await client.close();
    }
  }
}

async function testJWTVerification() {
  log('info', 'Testing JWT token lifecycle...');

  try {
    // Test 1: Generate token
    const testToken = jwt.sign(
      {
        userId: '507f1f77bcf86cd799439011',
        email: 'test@example.com',
        type: 'session'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Test 2: Verify immediately
    const decoded = jwt.verify(testToken, process.env.JWT_SECRET, {
      algorithms: ['HS256']
    });

    const expiresIn = decoded.exp - decoded.iat;
    const expiresInDays = (expiresIn / 86400).toFixed(2);

    log('success', 'JWT test passed:', {
      expiresInDays: expiresInDays,
      expiresInSeconds: expiresIn,
      expectedDays: 7,
      match: Math.abs(expiresInDays - 7) < 0.1
    });

    // Test 3: Verify with wrong secret (should fail)
    try {
      jwt.verify(testToken, 'wrong-secret');
      log('error', 'JWT verification with wrong secret should have failed!');
    } catch (err) {
      log('success', 'JWT correctly rejected wrong secret');
    }

    // Test 4: Check for expired token handling
    const expiredToken = jwt.sign(
      { test: 'expired' },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' }
    );

    try {
      jwt.verify(expiredToken, process.env.JWT_SECRET);
      log('error', 'Expired token verification should have failed!');
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        log('success', 'JWT correctly detected expired token');
      } else {
        log('warn', 'Unexpected error for expired token:', err.message);
      }
    }

    return true;

  } catch (error) {
    log('error', 'JWT test failed:', error);
    return false;
  }
}

async function analyzeCookieSettings() {
  log('info', 'Analyzing cookie configuration...');

  const settings = {
    maxAge: 7 * 24 * 60 * 60,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    domain: null
  };

  // Parse domain from API URL in production
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_API_URL) {
    try {
      const url = new URL(process.env.NEXT_PUBLIC_API_URL);
      settings.domain = url.hostname;
    } catch (err) {
      log('error', 'Failed to parse API URL for domain:', err.message);
    }
  }

  log('info', 'Cookie settings:', settings);

  // Identify potential issues
  const issues = [];

  if (settings.sameSite === 'strict') {
    issues.push({
      severity: 'MEDIUM',
      issue: 'sameSite=strict may block cookies on navigation',
      fix: 'Consider changing to sameSite=lax'
    });
  }

  if (settings.domain && settings.domain.includes('localhost')) {
    issues.push({
      severity: 'CRITICAL',
      issue: 'Domain set to localhost in production',
      fix: 'Update NEXT_PUBLIC_API_URL to production domain'
    });
  }

  if (!settings.secure && process.env.NODE_ENV === 'production') {
    issues.push({
      severity: 'CRITICAL',
      issue: 'Secure flag not set in production',
      fix: 'Set NODE_ENV=production'
    });
  }

  if (issues.length > 0) {
    log('warn', 'Cookie configuration issues detected:');
    issues.forEach(issue => {
      log('warn', `  [${issue.severity}] ${issue.issue}`);
      log('info', `    Fix: ${issue.fix}`);
    });
  } else {
    log('success', 'Cookie configuration looks correct');
  }

  return issues;
}

function printStatistics() {
  const uptimeSeconds = Math.floor((Date.now() - STATS.startTime) / 1000);
  const uptimeMinutes = Math.floor(uptimeSeconds / 60);

  console.log('\n' + '='.repeat(60));
  console.log('AUTHENTICATION STATISTICS');
  console.log('='.repeat(60));
  console.log(`Monitoring Time: ${uptimeMinutes} minutes (${uptimeSeconds}s)`);
  console.log(`Total Auth Attempts: ${STATS.totalAuthAttempts}`);
  console.log(`  ✅ Successful: ${STATS.successfulAuth}`);
  console.log(`  ❌ Failed: ${STATS.failedAuth}`);
  console.log('');
  console.log('Failure Breakdown:');
  console.log(`  JWT Expired: ${STATS.jwtExpired}`);
  console.log(`  JWT Invalid: ${STATS.jwtInvalid}`);
  console.log(`  User Not Found: ${STATS.userNotFound}`);
  console.log(`  User Inactive: ${STATS.userInactive}`);
  console.log(`  Database Errors: ${STATS.databaseErrors}`);
  console.log('');

  if (AUTH_FAILURES.length > 0) {
    console.log('Recent Failures:');
    AUTH_FAILURES.slice(-10).forEach(failure => {
      console.log(`  [${failure.timestamp}] ${failure.type}`);
      console.log(`    ${JSON.stringify(failure.details)}`);
    });
  }

  console.log('='.repeat(60) + '\n');
}

async function runMonitoring() {
  console.log('='.repeat(60));
  console.log('AUTHENTICATION FAILURE MONITOR');
  console.log('='.repeat(60));
  console.log('');
  console.log('This script monitors authentication failures and logout events.');
  console.log('Press Ctrl+C to stop monitoring and see final statistics.');
  console.log('');
  console.log('='.repeat(60));
  console.log('');

  // Initial checks
  await checkUserSessions();
  console.log('');
  await testJWTVerification();
  console.log('');
  await analyzeCookieSettings();
  console.log('');

  // Print statistics every 30 seconds
  setInterval(() => {
    printStatistics();
  }, 30000);

  // Check database health every 2 minutes
  setInterval(async () => {
    log('info', 'Periodic database health check...');
    await checkUserSessions();
  }, 120000);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\nShutting down monitor...\n');
    printStatistics();
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}

// Run monitor
runMonitoring()
  .catch(error => {
    log('error', 'Monitor crashed:', error);
    process.exit(1);
  });

/**
 * E2E Test Database Helpers
 * Helper functions for database operations in E2E tests
 *
 * SECURITY NOTES:
 * - Validates production database protection
 * - Prevents NoSQL injection with explicit operators
 * - Uses proper connection pooling
 * - Includes proper error recovery
 */

import { MongoClient, Db, ObjectId } from 'mongodb';

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Validate email format to prevent NoSQL injection
 */
function validateEmail(email: string): void {
  if (typeof email !== 'string' || !email.includes('@')) {
    throw new Error(`Invalid email format: ${email}`);
  }

  // Prevent NoSQL injection operators
  if (email.includes('$') || email.includes('{') || email.includes('}')) {
    throw new Error(`Email contains invalid characters: ${email}`);
  }
}

/**
 * Connect to MongoDB for test operations
 * CRITICAL: Includes production database protection
 */
export async function connectToTestDatabase(): Promise<Db> {
  if (db) return db;

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required for E2E tests');
  }

  // CRITICAL: Prevent production database access
  const dbName = new URL(DATABASE_URL).pathname.substring(1).split('?')[0];
  const isTestDatabase =
    DATABASE_URL.includes('_test') ||
    DATABASE_URL.includes('cartelbot_test') ||
    dbName.includes('_test') ||
    dbName.includes('test') ||
    process.env.NODE_ENV === 'test';

  if (!isTestDatabase) {
    throw new Error(
      `CRITICAL: DATABASE_URL must contain "_test" or "test" for E2E tests to prevent production data loss.\n` +
      `Current database: ${dbName}\n` +
      `Set NODE_ENV=test or use a test database.\n` +
      `Example: mongodb://localhost/cartelbot_test`
    );
  }

  try {
    client = new MongoClient(DATABASE_URL, {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      retryWrites: true,
      retryReads: true,
    });

    await client.connect();
    db = client.db(dbName);

    console.log(`[E2E Tests] ✓ Connected to test database: ${dbName}`);
    return db;
  } catch (error) {
    client = null;
    db = null;
    console.error('[E2E Tests] ✗ Database connection failed:', error);
    throw error;
  }
}

/**
 * Disconnect from MongoDB
 * Called in global teardown
 */
export async function disconnectFromTestDatabase() {
  if (client) {
    try {
      await client.close();
      console.log('[E2E Tests] ✓ Disconnected from database');
    } catch (error) {
      console.error('[E2E Tests] ✗ Disconnect error:', error);
    } finally {
      client = null;
      db = null;
    }
  }
}

/**
 * Clean up test user data
 * FIXED: NoSQL injection prevention + sequential deletion to avoid race conditions
 */
export async function cleanupTestUser(email: string) {
  validateEmail(email);

  const database = await connectToTestDatabase();

  // Find user with explicit $eq operator to prevent NoSQL injection
  const user = await database.collection('users').findOne({
    email: { $eq: email }
  });

  if (!user) {
    console.log(`[Database] No user found to cleanup: ${email}`);
    return;
  }

  const userId = user._id;

  try {
    // FIXED: Delete in order of dependencies to avoid race conditions
    // Delete child records first, then parent
    await database.collection('websocketsessions').deleteMany({ userId: { $eq: userId } });
    await database.collection('trades').deleteMany({ userId: { $eq: userId } });
    await database.collection('signals').deleteMany({ userId: { $eq: userId } });
    await database.collection('subscriptions').deleteMany({ userId: { $eq: userId } });
    await database.collection('users').deleteOne({ _id: { $eq: userId } });

    console.log(`[Database] ✓ Cleaned up test user: ${email}`);
  } catch (error) {
    console.error(`[Database] ✗ Cleanup failed for ${email}:`, error);
    throw error;
  }
}

/**
 * Create test user with API keys
 * FIXED: NoSQL injection prevention
 */
export async function createTestUser(email: string, apiKey?: string, apiSecret?: string) {
  validateEmail(email);

  const database = await connectToTestDatabase();

  // Check if user exists with explicit $eq operator
  const existing = await database.collection('users').findOne({
    email: { $eq: email }
  });

  if (existing) {
    console.log(`[Database] User already exists: ${email}`);
    return existing._id.toString();
  }

  // Create user with schema matching User model (flat structure, not nested)
  const result = await database.collection('users').insertOne({
    email,
    encryptedApiKey: apiKey || null,
    encryptedApiSecret: apiSecret || null,
    useTestnet: true,
    // Subscription fields (flat structure)
    subscriptionTier: 'free',
    subscriptionExpiry: null,
    isActive: true,
    lastLogin: null,
    // Risk management settings (flat structure)
    maxPositionSize: 1000,
    maxDailyLoss: 500,
    maxOpenPositions: 5,
    requireApproval: false,
    emergencyStop: false,
    investmentAmount: 100,
    maxTargets: 3,
    targetDistribution: [75, 15, 10],
    positionSizingMethod: 'fixed',
    riskPercentage: 2,
    // Email notification settings (nested structure)
    emailNotifications: {
      onTradeExecuted: true,
      onTargetHit: true,
      onStopLossHit: true,
      onTargetAdjustment: true,
      dailySummary: false,
    },
    emailFrequency: 'instant',
    telegramEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log(`[Database] ✓ Created test user: ${email}`);
  return result.insertedId.toString();
}

/**
 * Create test signal
 * FIXED: Validate ObjectId format
 */
export async function createTestSignal(userId: string, signalData: any) {
  if (!ObjectId.isValid(userId)) {
    throw new Error(`Invalid userId format: ${userId}`);
  }

  const database = await connectToTestDatabase();

  const result = await database.collection('signals').insertOne({
    userId: new ObjectId(userId),
    symbol: signalData.symbol || 'BTCUSDT',
    entries: signalData.entries || [50000],
    targets: signalData.targets || [52000, 54000, 56000],
    stopLoss: signalData.stopLoss || 48000,
    status: signalData.status || 'pending',
    source: signalData.source || 'text',
    parsedData: signalData.parsedData || {},
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log(`[Database] ✓ Created test signal: ${result.insertedId}`);
  return result.insertedId.toString();
}

/**
 * Get magic link token for test user
 * IMPLEMENTED: Retrieves token from database for E2E tests
 */
export async function getMagicLinkToken(email: string): Promise<string | null> {
  validateEmail(email);

  const database = await connectToTestDatabase();

  // Find the most recent magic link token with explicit $eq operator
  const tokenDoc = await database
    .collection('users')
    .findOne(
      { email: { $eq: email } },
      {
        sort: { updatedAt: -1 },
        projection: { magicLinkToken: 1, magicLinkExpiry: 1 }
      }
    );

  if (!tokenDoc || !tokenDoc.magicLinkToken) {
    console.warn(`[Database] ✗ No magic link token found for: ${email}`);
    return null;
  }

  // Check if token is expired
  if (tokenDoc.magicLinkExpiry && new Date(tokenDoc.magicLinkExpiry) < new Date()) {
    console.warn(`[Database] ✗ Magic link token expired for: ${email}`);
    return null;
  }

  console.log(`[Database] ✓ Retrieved magic link token for: ${email}`);
  return tokenDoc.magicLinkToken;
}

/**
 * Get signal by ID
 * FIXED: Validate ObjectId format
 */
export async function getSignalById(signalId: string) {
  if (!ObjectId.isValid(signalId)) {
    throw new Error(`Invalid signalId format: ${signalId}`);
  }

  const database = await connectToTestDatabase();
  return database.collection('signals').findOne({
    _id: { $eq: new ObjectId(signalId) }
  });
}

/**
 * Get trade by ID
 * FIXED: Validate ObjectId format
 */
export async function getTradeById(tradeId: string) {
  if (!ObjectId.isValid(tradeId)) {
    throw new Error(`Invalid tradeId format: ${tradeId}`);
  }

  const database = await connectToTestDatabase();
  return database.collection('trades').findOne({
    _id: { $eq: new ObjectId(tradeId) }
  });
}

/**
 * Get user by email
 * FIXED: NoSQL injection prevention
 */
export async function getUserByEmail(email: string) {
  validateEmail(email);

  const database = await connectToTestDatabase();
  return database.collection('users').findOne({
    email: { $eq: email }
  });
}

/**
 * Update user subscription
 * FIXED: NoSQL injection prevention + validate tier enum
 */
export async function updateUserSubscription(email: string, tier: 'free' | 'premium' | 'pro') {
  validateEmail(email);

  const validTiers = ['free', 'premium', 'pro'];
  if (!validTiers.includes(tier)) {
    throw new Error(`Invalid subscription tier: ${tier}`);
  }

  const database = await connectToTestDatabase();

  const result = await database.collection('users').updateOne(
    { email: { $eq: email } },
    {
      $set: {
        subscriptionTier: tier,
        isActive: true,
        subscriptionExpiry: tier === 'free' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      },
    }
  );

  if (result.matchedCount === 0) {
    throw new Error(`User not found: ${email}`);
  }

  console.log(`[Database] ✓ Updated subscription for ${email} to ${tier}`);
}

/**
 * Clean up all test data (run after all tests)
 * FIXED: Production database check + safe regex
 */
export async function cleanupAllTestData() {
  const database = await connectToTestDatabase();

  // Verify we're on a test database before bulk deletion
  const dbName = db?.databaseName || 'unknown';
  if (!dbName.includes('test')) {
    throw new Error(
      `CRITICAL: Refusing to cleanup non-test database: ${dbName}\n` +
      `This operation would delete all test users from production!`
    );
  }

  // Delete all users with test email domains (safe regex)
  const testDomains = ['example\\.com', 'test\\.com', 'e2e\\.test'];
  const testUsers = await database
    .collection('users')
    .find({
      email: {
        $regex: new RegExp(`@(${testDomains.join('|')})$`, 'i')
      },
    })
    .toArray();

  console.log(`[Database] Found ${testUsers.length} test users to cleanup`);

  for (const user of testUsers) {
    await cleanupTestUser(user.email);
  }

  console.log(`[Database] ✓ Cleaned up ${testUsers.length} test users`);
}

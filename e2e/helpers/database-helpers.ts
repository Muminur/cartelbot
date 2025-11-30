/**
 * E2E Test Database Helpers
 * Helper functions for database operations in E2E tests
 */

import { MongoClient, Db, ObjectId } from 'mongodb';

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Connect to MongoDB for test operations
 */
export async function connectToTestDatabase(): Promise<Db> {
  if (db) return db;

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required for E2E tests');
  }

  client = new MongoClient(DATABASE_URL);
  await client.connect();

  const dbName = new URL(DATABASE_URL).pathname.substring(1).split('?')[0];
  db = client.db(dbName);

  return db;
}

/**
 * Disconnect from MongoDB
 */
export async function disconnectFromTestDatabase() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

/**
 * Clean up test user data
 */
export async function cleanupTestUser(email: string) {
  const database = await connectToTestDatabase();

  // Find user
  const user = await database.collection('users').findOne({ email });
  if (!user) return;

  const userId = user._id;

  // Delete all related data
  await Promise.all([
    database.collection('signals').deleteMany({ userId }),
    database.collection('trades').deleteMany({ userId }),
    database.collection('subscriptions').deleteMany({ userId }),
    database.collection('websocketsessions').deleteMany({ userId }),
    database.collection('users').deleteOne({ _id: userId }),
  ]);

  console.log(`[Database] Cleaned up test user: ${email}`);
}

/**
 * Create test user with API keys
 */
export async function createTestUser(email: string, apiKey?: string, apiSecret?: string) {
  const database = await connectToTestDatabase();

  // Check if user exists
  const existing = await database.collection('users').findOne({ email });
  if (existing) {
    return existing._id.toString();
  }

  // Create user
  const result = await database.collection('users').insertOne({
    email,
    apiKey: apiKey || null,
    apiSecret: apiSecret || null,
    useTestnet: true,
    subscription: {
      tier: 'free',
      status: 'active',
      expiresAt: null,
    },
    settings: {
      maxPositionSize: 1000,
      maxDailyLoss: 500,
      maxOpenPositions: 5,
      requireApproval: false,
      emergencyStop: false,
      targetDistribution: [75, 15, 10],
      maxTargets: 5,
      notifications: {
        email: true,
        trades: true,
        signals: true,
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log(`[Database] Created test user: ${email}`);
  return result.insertedId.toString();
}

/**
 * Create test signal
 */
export async function createTestSignal(userId: string, signalData: any) {
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

  console.log(`[Database] Created test signal: ${result.insertedId}`);
  return result.insertedId.toString();
}

/**
 * Get magic link token for test user
 * This is a test helper that retrieves the token from the database
 * In production, tokens are sent via email
 */
export async function getMagicLinkToken(email: string): Promise<string | null> {
  const database = await connectToTestDatabase();

  // Find the most recent magic link token for this email
  // NOTE: This assumes your system stores tokens in a collection
  // Adjust based on your actual implementation
  const token = await database
    .collection('magiclinktokens')
    .findOne(
      { email },
      { sort: { createdAt: -1 } }
    );

  if (!token) {
    console.warn(`[Database] No magic link token found for: ${email}`);
    return null;
  }

  console.log(`[Database] Retrieved magic link token for: ${email}`);
  return token.token;
}

/**
 * Get signal by ID
 */
export async function getSignalById(signalId: string) {
  const database = await connectToTestDatabase();
  return database.collection('signals').findOne({ _id: new ObjectId(signalId) });
}

/**
 * Get trade by ID
 */
export async function getTradeById(tradeId: string) {
  const database = await connectToTestDatabase();
  return database.collection('trades').findOne({ _id: new ObjectId(tradeId) });
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string) {
  const database = await connectToTestDatabase();
  return database.collection('users').findOne({ email });
}

/**
 * Update user subscription
 */
export async function updateUserSubscription(email: string, tier: 'free' | 'premium' | 'pro') {
  const database = await connectToTestDatabase();

  await database.collection('users').updateOne(
    { email },
    {
      $set: {
        'subscription.tier': tier,
        'subscription.status': 'active',
        'subscription.expiresAt': tier === 'free' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      },
    }
  );

  console.log(`[Database] Updated subscription for ${email} to ${tier}`);
}

/**
 * Clean up all test data (run after all tests)
 */
export async function cleanupAllTestData() {
  const database = await connectToTestDatabase();

  // Delete all users with test email domains
  const testDomains = ['example.com', 'test.com'];
  const testUsers = await database
    .collection('users')
    .find({
      email: { $regex: new RegExp(`@(${testDomains.join('|')})$`, 'i') },
    })
    .toArray();

  for (const user of testUsers) {
    await cleanupTestUser(user.email);
  }

  console.log(`[Database] Cleaned up ${testUsers.length} test users`);
}

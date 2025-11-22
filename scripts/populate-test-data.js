/**
 * Populate test data for CartelBot dashboard
 *
 * Usage: node scripts/populate-test-data.js
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
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

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not found in .env.local');
  process.exit(1);
}

if (!ENCRYPTION_KEY) {
  console.error('ERROR: ENCRYPTION_KEY not found in .env.local');
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

async function main() {
  console.log('🚀 Starting test data population...\n');

  try {
    // Connect to MongoDB
    console.log('📊 Connecting to MongoDB...');
    await mongoose.connect(DATABASE_URL, {
      dbName: 'cartelbot',
      serverSelectionTimeoutMS: 5000,
    });
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // Check if data already exists
    const existingUsers = await db.collection('users').countDocuments();
    if (existingUsers > 0) {
      console.log(`⚠️  Database already has ${existingUsers} users`);
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise((resolve) => {
        readline.question('Do you want to clear existing data? (yes/no): ', resolve);
      });
      readline.close();

      if (answer.toLowerCase() === 'yes') {
        console.log('\n🗑️  Clearing existing data...');
        await Promise.all([
          db.collection('users').deleteMany({}),
          db.collection('signals').deleteMany({}),
          db.collection('trades').deleteMany({}),
          db.collection('subscriptions').deleteMany({}),
        ]);
        console.log('✅ Cleared all collections\n');
      } else {
        console.log('Keeping existing data. Adding new test data...\n');
      }
    }

    // Create test user
    console.log('👤 Creating test user...');
    const testEmail = 'test@cartelbot.coinspree.cc';

    // Encrypt dummy API keys
    const dummyApiKey = 'test_api_key_' + crypto.randomBytes(16).toString('hex');
    const dummyApiSecret = 'test_api_secret_' + crypto.randomBytes(32).toString('hex');

    const encryptedKey = encryptApiKey(dummyApiKey);
    const encryptedSecret = encryptApiKey(dummyApiSecret);

    const userId = new mongoose.Types.ObjectId();

    await db.collection('users').insertOne({
      _id: userId,
      email: testEmail,
      binanceApiKey: encryptedKey,
      binanceApiSecret: encryptedSecret,
      useTestnet: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log(`✅ Created user: ${testEmail}`);
    console.log(`   User ID: ${userId}\n`);

    // Create active subscription
    console.log('💳 Creating subscription...');
    await db.collection('subscriptions').insertOne({
      _id: new mongoose.Types.ObjectId(),
      userId: userId.toString(),
      plan: 'premium',
      status: 'active',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      usageStats: {
        signalsSubmitted: 3,
        tradesExecuted: 5,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log('✅ Created premium subscription\n');

    // Create test signals
    console.log('📊 Creating test signals...');

    const signals = [
      {
        _id: new mongoose.Types.ObjectId(),
        userId: userId.toString(),
        symbol: 'BTCUSDT',
        entries: [45000, 44800],
        targets: [46500, 47000, 48000, 49000],
        stopLoss: 43500,
        currentMarketPrice: 45200,
        status: 'executing',
        rawSignal: 'Buying $BTC\nEntry: 45000-44800\nTargets: 46500, 47000, 48000, 49000\nSL: 43500',
        isImageSignal: false,
        parseErrors: [],
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        updatedAt: new Date(),
      },
      {
        _id: new mongoose.Types.ObjectId(),
        userId: userId.toString(),
        symbol: 'ETHUSDT',
        entries: [2500, 2480],
        targets: [2600, 2650, 2700, 2800],
        stopLoss: 2400,
        currentMarketPrice: 2520,
        status: 'pending',
        rawSignal: 'Buying $ETH\nEntry: 2500-2480\nTargets: 2600, 2650, 2700, 2800\nSL: 2400',
        isImageSignal: false,
        parseErrors: [],
        createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
        updatedAt: new Date(),
      },
      {
        _id: new mongoose.Types.ObjectId(),
        userId: userId.toString(),
        symbol: 'BNBUSDT',
        entries: [320, 318],
        targets: [330, 335, 340, 350],
        stopLoss: 310,
        currentMarketPrice: 325,
        status: 'completed',
        rawSignal: 'Buying $BNB\nEntry: 320-318\nTargets: 330, 335, 340, 350\nSL: 310',
        isImageSignal: false,
        parseErrors: [],
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        updatedAt: new Date(),
      },
    ];

    await db.collection('signals').insertMany(signals);
    console.log(`✅ Created ${signals.length} signals\n`);

    // Create test trades
    console.log('💰 Creating test trades...');

    const trades = [
      {
        _id: new mongoose.Types.ObjectId(),
        userId: userId.toString(),
        signalId: signals[0]._id.toString(),
        symbol: 'BTCUSDT',
        side: 'buy',
        status: 'open',
        entryPrice: 45100,
        quantity: 0.05,
        investedAmount: 2255,
        buyOrder: {
          orderId: '100001',
          status: 'FILLED',
          executedQty: '0.05000000',
          cummulativeQuoteQty: '2255.00000000',
        },
        sellOrders: [],
        targetDistribution: [75, 15, 10],
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        updatedAt: new Date(),
      },
      {
        _id: new mongoose.Types.ObjectId(),
        userId: userId.toString(),
        signalId: signals[1]._id.toString(),
        symbol: 'ETHUSDT',
        side: 'buy',
        status: 'open',
        entryPrice: 2505,
        quantity: 2.0,
        investedAmount: 5010,
        buyOrder: {
          orderId: '100002',
          status: 'FILLED',
          executedQty: '2.00000000',
          cummulativeQuoteQty: '5010.00000000',
        },
        sellOrders: [],
        targetDistribution: [75, 15, 10],
        createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
        updatedAt: new Date(),
      },
      {
        _id: new mongoose.Types.ObjectId(),
        userId: userId.toString(),
        signalId: signals[2]._id.toString(),
        symbol: 'BNBUSDT',
        side: 'buy',
        status: 'closed',
        entryPrice: 319,
        exitPrice: 332,
        quantity: 10,
        investedAmount: 3190,
        realizedPnL: 130,
        realizedPnLPercent: 4.08,
        closeReason: 'target',
        closeReasonDetail: 'Targets 1,2 Hit',
        buyOrder: {
          orderId: '100003',
          status: 'FILLED',
          executedQty: '10.00000000',
          cummulativeQuoteQty: '3190.00000000',
        },
        sellOrders: [
          {
            orderId: '100004',
            orderListId: '200001',
            status: 'FILLED',
            type: 'LIMIT_MAKER',
            side: 'SELL',
            price: '330.00',
            quantity: '7.50000000',
            executedQty: '7.50000000',
            cummulativeQuoteQty: '2475.00000000',
          },
          {
            orderId: '100005',
            orderListId: '200002',
            status: 'FILLED',
            type: 'LIMIT_MAKER',
            side: 'SELL',
            price: '335.00',
            quantity: '1.50000000',
            executedQty: '1.50000000',
            cummulativeQuoteQty: '502.50000000',
          },
          {
            orderId: '100006',
            orderListId: '200003',
            status: 'CANCELED',
            type: 'STOP_LOSS_LIMIT',
            side: 'SELL',
            price: '310.00',
            stopPrice: '310.00',
            quantity: '1.00000000',
            executedQty: '0.00000000',
            cummulativeQuoteQty: '0.00000000',
          },
        ],
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        closedAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
        updatedAt: new Date(),
      },
      {
        _id: new mongoose.Types.ObjectId(),
        userId: userId.toString(),
        signalId: new mongoose.Types.ObjectId().toString(),
        symbol: 'ADAUSDT',
        side: 'buy',
        status: 'closed',
        entryPrice: 0.55,
        exitPrice: 0.52,
        quantity: 1000,
        investedAmount: 550,
        realizedPnL: -30,
        realizedPnLPercent: -5.45,
        closeReason: 'stop_loss',
        closeReasonDetail: 'Stop Loss Hit at 0.52',
        buyOrder: {
          orderId: '100007',
          status: 'FILLED',
          executedQty: '1000.00000000',
          cummulativeQuoteQty: '550.00000000',
        },
        sellOrders: [
          {
            orderId: '100008',
            orderListId: '200004',
            status: 'FILLED',
            type: 'STOP_LOSS_LIMIT',
            side: 'SELL',
            price: '0.52',
            stopPrice: '0.52',
            quantity: '1000.00000000',
            executedQty: '1000.00000000',
            cummulativeQuoteQty: '520.00000000',
          },
        ],
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        closedAt: new Date(Date.now() - 36 * 60 * 60 * 1000),
        updatedAt: new Date(),
      },
    ];

    await db.collection('trades').insertMany(trades);
    console.log(`✅ Created ${trades.length} trades\n`);

    // Summary
    console.log('📈 Test Data Summary:');
    console.log('==========================================');
    console.log(`👤 User: ${testEmail}`);
    console.log(`📊 Signals: ${signals.length} (1 executing, 1 pending, 1 completed)`);
    console.log(`💰 Trades: ${trades.length} (2 open, 2 closed)`);
    console.log(`💵 Total P&L: +$100.00 (1 win, 1 loss)`);
    console.log(`📈 Win Rate: 50%`);
    console.log('==========================================\n');

    console.log('✅ Test data population completed!\n');
    console.log('🔐 Login credentials:');
    console.log(`   Email: ${testEmail}`);
    console.log('   Use magic link authentication\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('👋 Database connection closed');
  }
}

main();

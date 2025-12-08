/**
 * MongoDB Load Test Script
 *
 * Tests various database operations to identify performance bottlenecks
 * and potential causes of server becoming unresponsive.
 *
 * Usage: node scripts/db-load-test.js
 */

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

// Load environment variables
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in .env.local');
  process.exit(1);
}

// Test configuration
const CONFIG = {
  // Connection tests
  maxConnections: 20,
  connectionTestDuration: 10000, // 10 seconds

  // Query tests
  queryConcurrency: 10,
  queryIterations: 50,

  // Write tests
  writeDocuments: 100,

  // Aggregation tests
  aggregationIterations: 20,
};

// Results storage
const results = {
  connectionTests: [],
  queryTests: [],
  writeTests: [],
  aggregationTests: [],
  indexTests: [],
  serverStats: null,
};

// Utility functions
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatMs(ms) {
  return ms.toFixed(2) + 'ms';
}

async function measureTime(fn, label) {
  const start = process.hrtime.bigint();
  try {
    const result = await fn();
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;
    return { success: true, durationMs, result, label };
  } catch (error) {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;
    return { success: false, durationMs, error: error.message, label };
  }
}

// Test 1: Connection Pool Stress Test
async function testConnectionPool() {
  console.log('\n📊 TEST 1: Connection Pool Stress Test');
  console.log('=' .repeat(50));

  const connections = [];
  const connectionTimes = [];

  try {
    // Create multiple connections rapidly
    for (let i = 0; i < CONFIG.maxConnections; i++) {
      const start = Date.now();
      const conn = await mongoose.createConnection(DATABASE_URL, {
        maxPoolSize: 1,
        minPoolSize: 1,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 10000,
      }).asPromise();
      const duration = Date.now() - start;
      connectionTimes.push(duration);
      connections.push(conn);
      process.stdout.write(`  Connection ${i + 1}/${CONFIG.maxConnections} (${duration}ms)\r`);
    }

    console.log(`\n  ✅ Created ${connections.length} connections`);
    console.log(`  ⏱️  Avg connection time: ${formatMs(connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length)}`);
    console.log(`  ⏱️  Max connection time: ${formatMs(Math.max(...connectionTimes))}`);
    console.log(`  ⏱️  Min connection time: ${formatMs(Math.min(...connectionTimes))}`);

    results.connectionTests.push({
      test: 'Connection Pool Creation',
      connections: connections.length,
      avgTime: connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length,
      maxTime: Math.max(...connectionTimes),
      minTime: Math.min(...connectionTimes),
      status: 'PASS',
    });

  } catch (error) {
    console.log(`  ❌ Connection pool test failed: ${error.message}`);
    results.connectionTests.push({
      test: 'Connection Pool Creation',
      status: 'FAIL',
      error: error.message,
    });
  } finally {
    // Close all connections
    for (const conn of connections) {
      await conn.close().catch(() => {});
    }
    console.log(`  🔒 Closed all test connections`);
  }
}

// Test 2: Query Performance
async function testQueryPerformance() {
  console.log('\n📊 TEST 2: Query Performance Test');
  console.log('=' .repeat(50));

  const conn = await mongoose.createConnection(DATABASE_URL, {
    maxPoolSize: CONFIG.queryConcurrency,
    serverSelectionTimeoutMS: 30000,
  }).asPromise();

  const db = conn.db;
  const collections = ['users', 'signals', 'trades', 'discordconnections', 'discordmessages'];

  for (const collName of collections) {
    const coll = db.collection(collName);
    const queryTimes = [];

    console.log(`\n  Testing collection: ${collName}`);

    // Count documents
    const countResult = await measureTime(
      () => coll.countDocuments(),
      `${collName}.countDocuments()`
    );
    console.log(`    📄 Document count: ${countResult.result || 'N/A'} (${formatMs(countResult.durationMs)})`);

    // Find queries (with limit)
    for (let i = 0; i < 5; i++) {
      const findResult = await measureTime(
        () => coll.find({}).limit(100).toArray(),
        `${collName}.find().limit(100)`
      );
      queryTimes.push(findResult.durationMs);
    }

    // FindOne query
    const findOneResult = await measureTime(
      () => coll.findOne({}),
      `${collName}.findOne()`
    );
    queryTimes.push(findOneResult.durationMs);

    const avgQueryTime = queryTimes.reduce((a, b) => a + b, 0) / queryTimes.length;
    console.log(`    ⏱️  Avg query time: ${formatMs(avgQueryTime)}`);

    // Flag slow queries
    if (avgQueryTime > 100) {
      console.log(`    ⚠️  WARNING: Slow queries detected!`);
    }

    results.queryTests.push({
      collection: collName,
      documentCount: countResult.result || 0,
      avgQueryTime,
      maxQueryTime: Math.max(...queryTimes),
      status: avgQueryTime > 500 ? 'SLOW' : avgQueryTime > 100 ? 'WARN' : 'OK',
    });
  }

  await conn.close();
}

// Test 3: Concurrent Query Stress
async function testConcurrentQueries() {
  console.log('\n📊 TEST 3: Concurrent Query Stress Test');
  console.log('=' .repeat(50));

  const conn = await mongoose.createConnection(DATABASE_URL, {
    maxPoolSize: CONFIG.queryConcurrency,
    serverSelectionTimeoutMS: 30000,
  }).asPromise();

  const db = conn.db;
  const signals = db.collection('signals');
  const trades = db.collection('trades');

  // Simulate the dashboard loading (multiple concurrent queries)
  const dashboardQueries = [
    () => signals.countDocuments(),
    () => signals.countDocuments({ status: 'pending' }),
    () => signals.countDocuments({ status: 'executing' }),
    () => signals.countDocuments({ status: 'completed' }),
    () => trades.countDocuments(),
    () => trades.countDocuments({ status: 'open' }),
    () => trades.countDocuments({ status: 'closed' }),
    () => trades.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]).toArray(),
    () => signals.find({}).sort({ createdAt: -1 }).limit(10).toArray(),
    () => trades.find({}).sort({ createdAt: -1 }).limit(10).toArray(),
  ];

  console.log(`\n  Running ${dashboardQueries.length} concurrent queries (simulating dashboard load)...`);

  const iterations = 10;
  const iterationTimes = [];

  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    await Promise.all(dashboardQueries.map(q => q()));
    const duration = Date.now() - start;
    iterationTimes.push(duration);
    process.stdout.write(`    Iteration ${i + 1}/${iterations}: ${duration}ms\r`);
  }

  const avgTime = iterationTimes.reduce((a, b) => a + b, 0) / iterationTimes.length;
  const maxTime = Math.max(...iterationTimes);

  console.log(`\n  ✅ Completed ${iterations} dashboard simulations`);
  console.log(`  ⏱️  Avg dashboard load: ${formatMs(avgTime)}`);
  console.log(`  ⏱️  Max dashboard load: ${formatMs(maxTime)}`);

  if (maxTime > 2000) {
    console.log(`  ⚠️  WARNING: Dashboard load exceeds 2 seconds!`);
  }

  results.queryTests.push({
    test: 'Concurrent Dashboard Queries',
    avgTime,
    maxTime,
    iterations,
    status: maxTime > 5000 ? 'CRITICAL' : maxTime > 2000 ? 'SLOW' : 'OK',
  });

  await conn.close();
}

// Test 4: Aggregation Performance
async function testAggregations() {
  console.log('\n📊 TEST 4: Aggregation Performance Test');
  console.log('=' .repeat(50));

  const conn = await mongoose.createConnection(DATABASE_URL, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 30000,
  }).asPromise();

  const db = conn.db;
  const trades = db.collection('trades');

  const aggregations = [
    {
      name: 'Group by status',
      pipeline: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
    },
    {
      name: 'Group by symbol',
      pipeline: [{ $group: { _id: '$symbol', count: { $sum: 1 }, totalVolume: { $sum: '$investedAmount' } } }],
    },
    {
      name: 'P&L Summary',
      pipeline: [
        { $match: { status: 'closed' } },
        { $group: { _id: null, totalPnL: { $sum: '$profitLoss' }, totalVolume: { $sum: '$investedAmount' } } },
      ],
    },
    {
      name: 'Recent trades with lookup',
      pipeline: [
        { $sort: { createdAt: -1 } },
        { $limit: 50 },
        { $lookup: { from: 'signals', localField: 'signalId', foreignField: '_id', as: 'signal' } },
      ],
    },
  ];

  for (const agg of aggregations) {
    const times = [];
    for (let i = 0; i < 5; i++) {
      const result = await measureTime(
        () => trades.aggregate(agg.pipeline).toArray(),
        agg.name
      );
      times.push(result.durationMs);
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(`  📊 ${agg.name}: ${formatMs(avgTime)} avg`);

    if (avgTime > 500) {
      console.log(`     ⚠️  This aggregation is slow and may cause hangs`);
    }

    results.aggregationTests.push({
      name: agg.name,
      avgTime,
      maxTime: Math.max(...times),
      status: avgTime > 1000 ? 'CRITICAL' : avgTime > 500 ? 'SLOW' : 'OK',
    });
  }

  await conn.close();
}

// Test 5: Index Analysis
async function testIndexes() {
  console.log('\n📊 TEST 5: Index Analysis');
  console.log('=' .repeat(50));

  const conn = await mongoose.createConnection(DATABASE_URL, {
    serverSelectionTimeoutMS: 30000,
  }).asPromise();

  const db = conn.db;
  const collections = ['users', 'signals', 'trades'];

  for (const collName of collections) {
    const coll = db.collection(collName);

    try {
      const indexes = await coll.indexes();
      const stats = await coll.stats().catch(() => null);

      console.log(`\n  Collection: ${collName}`);
      console.log(`    📄 Documents: ${stats?.count || 'N/A'}`);
      console.log(`    💾 Size: ${stats ? formatBytes(stats.size) : 'N/A'}`);
      console.log(`    📑 Indexes: ${indexes.length}`);

      indexes.forEach(idx => {
        console.log(`      - ${idx.name}: ${JSON.stringify(idx.key)}`);
      });

      results.indexTests.push({
        collection: collName,
        documentCount: stats?.count || 0,
        size: stats?.size || 0,
        indexCount: indexes.length,
        indexes: indexes.map(i => i.name),
      });

    } catch (error) {
      console.log(`    ❌ Error: ${error.message}`);
    }
  }

  await conn.close();
}

// Test 6: Server Stats
async function getServerStats() {
  console.log('\n📊 TEST 6: Server Statistics');
  console.log('=' .repeat(50));

  const conn = await mongoose.createConnection(DATABASE_URL, {
    serverSelectionTimeoutMS: 30000,
  }).asPromise();

  try {
    const admin = conn.db.admin();
    const serverStatus = await admin.serverStatus();

    console.log(`\n  MongoDB Version: ${serverStatus.version}`);
    console.log(`  Uptime: ${Math.floor(serverStatus.uptime / 3600)} hours`);
    console.log(`  Current Connections: ${serverStatus.connections.current}`);
    console.log(`  Available Connections: ${serverStatus.connections.available}`);
    console.log(`  Total Connections Created: ${serverStatus.connections.totalCreated}`);

    // Memory stats
    if (serverStatus.mem) {
      console.log(`\n  Memory Usage:`);
      console.log(`    Resident: ${formatBytes(serverStatus.mem.resident * 1024 * 1024)}`);
      console.log(`    Virtual: ${formatBytes(serverStatus.mem.virtual * 1024 * 1024)}`);
    }

    // Operation counters
    if (serverStatus.opcounters) {
      console.log(`\n  Operation Counters:`);
      console.log(`    Insert: ${serverStatus.opcounters.insert}`);
      console.log(`    Query: ${serverStatus.opcounters.query}`);
      console.log(`    Update: ${serverStatus.opcounters.update}`);
      console.log(`    Delete: ${serverStatus.opcounters.delete}`);
    }

    // Check for concerning stats
    const concerns = [];
    if (serverStatus.connections.current > serverStatus.connections.available * 0.8) {
      concerns.push('⚠️  Connection pool is nearly exhausted!');
    }
    if (serverStatus.mem && serverStatus.mem.resident > 1024) {
      concerns.push('⚠️  High memory usage detected');
    }

    if (concerns.length > 0) {
      console.log(`\n  ⚠️  CONCERNS:`);
      concerns.forEach(c => console.log(`    ${c}`));
    }

    results.serverStats = {
      version: serverStatus.version,
      uptime: serverStatus.uptime,
      connections: serverStatus.connections,
      memory: serverStatus.mem,
      opcounters: serverStatus.opcounters,
      concerns,
    };

  } catch (error) {
    console.log(`  ❌ Could not get server stats: ${error.message}`);
    console.log(`     (This may require admin privileges)`);
  }

  await conn.close();
}

// Test 7: Memory Leak Detection (Connection Leak)
async function testConnectionLeak() {
  console.log('\n📊 TEST 7: Connection Leak Detection');
  console.log('=' .repeat(50));

  const conn = await mongoose.createConnection(DATABASE_URL, {
    serverSelectionTimeoutMS: 30000,
  }).asPromise();

  try {
    const admin = conn.db.admin();
    const before = await admin.serverStatus();
    const beforeConnections = before.connections.current;

    console.log(`  Connections before test: ${beforeConnections}`);

    // Simulate rapid connection creation/destruction
    const iterations = 10;
    for (let i = 0; i < iterations; i++) {
      const tempConn = await mongoose.createConnection(DATABASE_URL, {
        maxPoolSize: 1,
        serverSelectionTimeoutMS: 5000,
      }).asPromise();

      // Do a quick query
      await tempConn.db.collection('users').findOne({});

      // Close connection
      await tempConn.close();

      process.stdout.write(`    Iteration ${i + 1}/${iterations}\r`);
    }

    // Wait a bit for connections to fully close
    await new Promise(resolve => setTimeout(resolve, 2000));

    const after = await admin.serverStatus();
    const afterConnections = after.connections.current;

    console.log(`\n  Connections after test: ${afterConnections}`);
    console.log(`  Connection delta: ${afterConnections - beforeConnections}`);

    if (afterConnections > beforeConnections + 2) {
      console.log(`  ⚠️  WARNING: Potential connection leak detected!`);
    } else {
      console.log(`  ✅ No connection leak detected`);
    }

  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
  }

  await conn.close();
}

// Generate Summary Report
function generateReport() {
  console.log('\n');
  console.log('=' .repeat(60));
  console.log('📋 LOAD TEST SUMMARY REPORT');
  console.log('=' .repeat(60));

  // Critical issues
  const criticalIssues = [];
  const warnings = [];

  // Check query tests
  results.queryTests.forEach(test => {
    if (test.status === 'CRITICAL' || test.status === 'SLOW') {
      criticalIssues.push(`Slow queries on ${test.collection || test.test}: ${formatMs(test.avgTime || test.maxTime)}`);
    } else if (test.status === 'WARN') {
      warnings.push(`Elevated query times on ${test.collection}: ${formatMs(test.avgTime)}`);
    }
  });

  // Check aggregation tests
  results.aggregationTests.forEach(test => {
    if (test.status === 'CRITICAL') {
      criticalIssues.push(`Critical aggregation: ${test.name} (${formatMs(test.avgTime)})`);
    } else if (test.status === 'SLOW') {
      warnings.push(`Slow aggregation: ${test.name} (${formatMs(test.avgTime)})`);
    }
  });

  // Check server stats
  if (results.serverStats?.concerns?.length > 0) {
    criticalIssues.push(...results.serverStats.concerns);
  }

  // Print findings
  if (criticalIssues.length > 0) {
    console.log('\n🚨 CRITICAL ISSUES:');
    criticalIssues.forEach(issue => console.log(`   - ${issue}`));
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    warnings.forEach(warn => console.log(`   - ${warn}`));
  }

  if (criticalIssues.length === 0 && warnings.length === 0) {
    console.log('\n✅ No critical issues or warnings detected');
  }

  // Recommendations
  console.log('\n📝 RECOMMENDATIONS:');

  if (results.serverStats?.connections?.current > 50) {
    console.log('   1. Reduce maxPoolSize in connection options');
    console.log('   2. Ensure connections are being closed properly');
  }

  results.queryTests.forEach(test => {
    if ((test.status === 'SLOW' || test.status === 'CRITICAL') && test.collection) {
      console.log(`   - Add indexes to ${test.collection} collection`);
    }
  });

  if (results.aggregationTests.some(t => t.status !== 'OK')) {
    console.log('   - Consider adding compound indexes for aggregation queries');
    console.log('   - Use $match early in aggregation pipelines');
  }

  console.log('\n' + '=' .repeat(60));
}

// Main execution
async function main() {
  console.log('🔬 MongoDB Load Test for CartelBot');
  console.log('=' .repeat(60));
  console.log(`Database: ${DATABASE_URL.replace(/\/\/.*:.*@/, '//***:***@')}`);
  console.log(`Started: ${new Date().toISOString()}`);

  try {
    await testConnectionPool();
    await testQueryPerformance();
    await testConcurrentQueries();
    await testAggregations();
    await testIndexes();
    await getServerStats();
    await testConnectionLeak();

    generateReport();

  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    console.error(error.stack);
  }

  console.log(`\nCompleted: ${new Date().toISOString()}`);
  process.exit(0);
}

main();

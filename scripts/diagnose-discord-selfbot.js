#!/usr/bin/env node
/**
 * Comprehensive Discord Selfbot Diagnostic
 *
 * This script diagnoses why Discord messages are not being detected
 */
const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

async function main() {
  console.log('='.repeat(70));
  console.log('DISCORD SELFBOT DIAGNOSTIC TOOL');
  console.log('='.repeat(70));
  console.log('');

  // Step 1: Check Python service
  console.log('1. CHECKING PYTHON SERVICE...');
  console.log('-'.repeat(70));

  const pythonServiceUrl = process.env.DISCORD_PYTHON_SERVICE_URL || 'http://localhost:8000';
  console.log(`   Service URL: ${pythonServiceUrl}`);

  try {
    const response = await fetch(`${pythonServiceUrl}/client/status`);
    const data = await response.json();
    console.log(`   Status: ✅ RUNNING`);
    console.log(`   Active Clients: ${data.activeClients} / ${data.maxClients}`);

    if (data.activeClients === 0) {
      console.log(`   ⚠️  WARNING: No active Discord clients!`);
      console.log(`   → This means NO Discord client is connected to monitor messages`);
    } else {
      console.log(`   Client details:`);
      Object.entries(data.clients).forEach(([userId, client]) => {
        console.log(`     - User: ${userId}`);
        console.log(`       Connected: ${client.connected}`);
        console.log(`       Server: ${client.serverId}`);
        console.log(`       Channel: ${client.channelId}`);
      });
    }
  } catch (error) {
    console.log(`   Status: ❌ NOT RUNNING`);
    console.log(`   Error: ${error.message}`);
    console.log(`   → The Python Discord service is not running!`);
    console.log(`   → Start it with: cd services/discord-selfbot && python main.py`);
    return;
  }
  console.log('');

  // Step 2: Check database connections
  console.log('2. CHECKING DATABASE CONNECTIONS...');
  console.log('-'.repeat(70));

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.log('   ❌ DATABASE_URL not found in .env.local');
    return;
  }

  const client = new MongoClient(DATABASE_URL);

  try {
    await client.connect();
    const db = client.db('cartelbot');

    // Check Discord connections
    const connections = await db.collection('discordConnections').find({}).toArray();
    console.log(`   Total connections: ${connections.length}`);

    if (connections.length === 0) {
      console.log(`   ⚠️  WARNING: No Discord connections in database!`);
      console.log(`   → User has not connected Discord yet`);
      console.log(`   → Go to /settings/discord-integration to connect`);
    } else {
      connections.forEach((conn, index) => {
        console.log(`   Connection ${index + 1}:`);
        console.log(`     - User ID: ${conn.userId}`);
        console.log(`     - Discord User: ${conn.discordUsername} (${conn.discordUserId})`);
        console.log(`     - Guild ID: ${conn.guildId}`);
        console.log(`     - Channel ID: ${conn.channelId}`);
        console.log(`     - Active: ${conn.active}`);
        console.log(`     - Created: ${conn.createdAt}`);
      });
    }
    console.log('');

    // Step 3: Check processed messages
    console.log('3. CHECKING PROCESSED MESSAGES...');
    console.log('-'.repeat(70));

    const messages = await db.collection('discordMessages').find({}).sort({ processedAt: -1 }).limit(10).toArray();
    console.log(`   Total messages: ${messages.length}`);

    if (messages.length === 0) {
      console.log(`   ⚠️  No messages processed yet`);
      console.log(`   → Discord client has not detected any messages`);
    } else {
      console.log(`   Recent messages (last 10):`);
      messages.forEach((msg, index) => {
        console.log(`     ${index + 1}. Message ID: ${msg.discordMessageId}`);
        console.log(`        Processed: ${msg.processedAt}`);
        console.log(`        Connection ID: ${msg.connectionId}`);
      });
    }
    console.log('');

    // Step 4: Diagnosis summary
    console.log('4. DIAGNOSIS SUMMARY');
    console.log('='.repeat(70));

    const pythonServiceRunning = true; // We got here, so it's running
    const hasConnections = connections.length > 0;
    const hasActiveConnections = connections.some(c => c.active);
    const hasMessages = messages.length > 0;

    console.log('');
    console.log('Status:');
    console.log(`  Python Service: ${pythonServiceRunning ? '✅ Running' : '❌ Not Running'}`);
    console.log(`  Database Connections: ${hasConnections ? '✅ Exists' : '❌ None'}`);
    console.log(`  Active Connections: ${hasActiveConnections ? '✅ Yes' : '❌ No'}`);
    console.log(`  Messages Processed: ${hasMessages ? '✅ Yes' : '❌ None'}`);
    console.log('');

    // Root cause analysis
    console.log('ROOT CAUSE ANALYSIS:');
    console.log('-'.repeat(70));

    if (!hasConnections) {
      console.log('❌ ISSUE: No Discord connection exists in database');
      console.log('   SOLUTION: Go to /settings/discord-integration and connect Discord');
    } else if (!hasActiveConnections) {
      console.log('❌ ISSUE: Discord connection exists but is NOT ACTIVE');
      console.log('   SOLUTION: The connection was stopped. Reconnect from Discord settings.');
    } else if (data.activeClients === 0) {
      console.log('❌ ISSUE: Database shows active connection, but Python service has no clients');
      console.log('   SOLUTION: State mismatch. The Python service restarted but connection not re-established.');
      console.log('   ACTION: Disconnect and reconnect from Discord settings page.');
    } else {
      console.log('✅ Everything looks configured correctly!');
      console.log('');
      console.log('NEXT STEPS TO TEST:');
      console.log('  1. Post a test message in the Discord channel');
      console.log('  2. Check Python service logs for "on_message fired" events');
      console.log('  3. Verify channel ID matches: ' + (connections[0]?.channelId || 'N/A'));
      console.log('  4. Check if message is from a bot (bot messages are ignored)');
    }

    console.log('');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('Database Error:', error.message);
  } finally {
    await client.close();
  }
}

main().catch(console.error);

#!/usr/bin/env node
/**
 * Check Discord connection in database
 */
const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL;

  if (!DATABASE_URL) {
    console.error('DATABASE_URL not found in .env.local');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  const client = new MongoClient(DATABASE_URL);

  try {
    await client.connect();
    console.log('Connected successfully');

    const db = client.db('cartelbot');

    // Find all Discord connections
    const connections = await db.collection('discordConnections').find({}).toArray();

    console.log(`\nFound ${connections.length} Discord connection(s):\n`);

    connections.forEach((conn, index) => {
      console.log(`Connection ${index + 1}:`);
      console.log(`  _id: ${conn._id}`);
      console.log(`  userId: ${conn.userId}`);
      console.log(`  discordUserId: ${conn.discordUserId}`);
      console.log(`  discordUsername: ${conn.discordUsername}`);
      console.log(`  guildId: ${conn.guildId}`);
      console.log(`  channelId: ${conn.channelId}`);
      console.log(`  active: ${conn.active}`);
      console.log(`  createdAt: ${conn.createdAt}`);
      console.log('');
    });

    // Check if there are any Discord messages
    const messages = await db.collection('discordMessages').find({}).toArray();
    console.log(`Found ${messages.length} Discord message(s) in database\n`);

    if (messages.length > 0) {
      console.log('Recent messages:');
      messages.slice(0, 5).forEach((msg, index) => {
        console.log(`  ${index + 1}. Message ID: ${msg.discordMessageId}, Processed: ${msg.processedAt}`);
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\nDisconnected from MongoDB');
  }
}

main();

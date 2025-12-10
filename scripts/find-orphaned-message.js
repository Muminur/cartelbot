#!/usr/bin/env node
/**
 * Find orphaned Discord message (message with no matching connection)
 */
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL;
  const client = new MongoClient(DATABASE_URL);

  try {
    await client.connect();
    const db = client.db('cartelbot');

    // Get the orphaned message
    const message = await db.collection('discordMessages').findOne({
      discordMessageId: '1448223586585153556'
    });

    console.log('Orphaned Message Details:');
    console.log(JSON.stringify(message, null, 2));
    console.log('');

    // Try to find the connection
    const connectionId = message.connectionId;
    console.log(`Searching for connection: ${connectionId}`);

    const connection = await db.collection('discordConnections').findOne({
      _id: new ObjectId(connectionId)
    });

    if (connection) {
      console.log('Connection FOUND:');
      console.log(JSON.stringify(connection, null, 2));
    } else {
      console.log('Connection NOT FOUND - it was deleted!');
      console.log('');
      console.log('This means the user either:');
      console.log('  1. Disconnected Discord from settings');
      console.log('  2. Connection was auto-deleted due to error');
      console.log('  3. Connection document was manually removed');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
  }
}

main();

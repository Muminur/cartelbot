/**
 * Sync Discord connection state between Python service and MongoDB
 *
 * Use this when Python service has active clients but database has no records
 */

const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config({ path: '.env.local' });

async function syncDiscordState() {
  try {
    console.log('🔄 Syncing Discord state...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.DATABASE_URL);
    console.log('✅ MongoDB connected\n');

    // Get Python service status
    const pythonUrl = process.env.DISCORD_PYTHON_SERVICE_URL || 'http://localhost:8000';
    console.log(`📡 Checking Python service at ${pythonUrl}...`);

    const healthResponse = await axios.get(`${pythonUrl}/health`);
    console.log(`✅ Python service: ${healthResponse.data.status}`);
    console.log(`   Active clients: ${healthResponse.data.active_clients}\n`);

    if (healthResponse.data.active_clients === 0) {
      console.log('❌ No active clients in Python service');
      console.log('   → Go to /discord-integration to connect\n');
      await mongoose.disconnect();
      return;
    }

    // Get client details
    console.log('🔍 Fetching client details from Python service...');
    const clientsResponse = await axios.get(`${pythonUrl}/clients`);
    const clients = clientsResponse.data;

    console.log(`\nFound ${clients.length} active client(s):\n`);

    // Get DiscordConnection model
    const DiscordConnection = mongoose.connection.collection('discordconnections');

    // Check each client
    for (const client of clients) {
      console.log(`Client ${client.userId}:`);
      console.log(`  Server: ${client.serverId}`);
      console.log(`  Channel: ${client.channelId}`);
      console.log(`  Connection ID: ${client.connectionId}`);

      // Check if database record exists
      const dbRecord = await DiscordConnection.findOne({
        _id: new mongoose.Types.ObjectId(client.connectionId)
      });

      if (dbRecord) {
        console.log(`  ✅ Database record exists`);
      } else {
        console.log(`  ❌ Database record MISSING`);
        console.log(`\n⚠️  MANUAL ACTION REQUIRED:`);
        console.log(`   The connection exists in Python service but not in database.`);
        console.log(`   This happens when:`);
        console.log(`   1. Connection was deleted from UI but Python service still running`);
        console.log(`   2. Database was cleared but Python service wasn't restarted`);
        console.log(`\n   SOLUTION: Go to /discord-integration and reconnect Discord`);
        console.log(`   This will create a fresh database record matching the Python service state.\n`);
      }
    }

    await mongoose.disconnect();
    console.log('\n✅ Sync check complete');

  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('❌ Cannot connect to Python service');
      console.error('   Make sure the service is running on port 8000');
    } else {
      console.error('❌ Error:', error.message);
    }
    process.exit(1);
  }
}

syncDiscordState();

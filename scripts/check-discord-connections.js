const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

mongoose.connect(process.env.DATABASE_URL)
  .then(async () => {
    const DiscordConnection = mongoose.model('DiscordConnection', new mongoose.Schema({}, { strict: false, collection: 'discordconnections' }));

    const connections = await DiscordConnection.find({})
      .sort({ createdAt: -1 })
      .lean();

    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║         DISCORD CONNECTIONS DATABASE STATUS              ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    if (connections.length === 0) {
      console.log('✅ No existing connections found.');
      console.log('   You can now create a new Discord connection!\n');
    } else {
      console.log('📋 Existing Connections:', connections.length);
      console.log('');
      connections.forEach((conn, i) => {
        console.log(`Connection ${i + 1}:`);
        console.log('  ID:', String(conn._id));
        console.log('  User ID:', String(conn.userId));
        console.log('  Server:', conn.serverName, '(' + conn.serverId + ')');
        console.log('  Channel:', conn.channelName, '(' + conn.channelId + ')');
        console.log('  Status:', conn.status);
        console.log('  Active:', conn.isActive);
        console.log('  Auto Execute:', conn.autoExecute);
        console.log('  Last Error:', conn.lastError || 'None');
        console.log('  Created:', new Date(conn.createdAt).toLocaleString());
        console.log('');
      });
    }

    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });

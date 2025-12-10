const mongoose = require('mongoose');

const connectionString = "mongodb://root:BcxobDtsHN5cIWaYXBAC2iyGpYDNl6nkT5uzkpZZFVhLfbTXK61uqd67bEKUPHBb@66.179.240.208:5999/?directConnection=true";

async function check() {
  try {
    await mongoose.connect(connectionString, { dbName: 'cartelbot' });

    const DiscordConnection = mongoose.model('DiscordConnection', new mongoose.Schema({}, { strict: false, collection: 'discordconnections' }));

    // Find the active connection
    const connection = await DiscordConnection.findById('6938e4d5c8e32989f2a114c3').lean();
    console.log('=== Active Connection ===');
    console.log(JSON.stringify(connection, null, 2));

    // Check user
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false, collection: 'users' }));
    const user = await User.findById('6911d21a06ca4503b48afe7a').lean();
    console.log('\n=== User ===');
    console.log(`Email: ${user?.email || 'N/A'}`);
    console.log(`ID: ${user?._id || 'N/A'}`);
    console.log(`Test: ${user ? 'Found' : 'Not found'}`);

    // Check for Discord messages
    const DiscordMessage = mongoose.model('DiscordMessage', new mongoose.Schema({}, { strict: false, collection: 'discordmessages' }));
    const messageCount = await DiscordMessage.countDocuments({ connectionId: '6938e4d5c8e32989f2a114c3' });
    console.log(`\n=== Discord Messages: ${messageCount} ===`);

    if (messageCount > 0) {
      const messages = await DiscordMessage.find({ connectionId: '6938e4d5c8e32989f2a114c3' })
        .sort({ timestamp: -1 })
        .limit(5)
        .lean();
      console.log('\nRecent messages:');
      messages.forEach(m => {
        const preview = m.content ? m.content.substring(0, 50) : 'N/A';
        console.log(`- ${m.timestamp}: ${preview}... (${m.processingStatus})`);
      });
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

check();

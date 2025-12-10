const mongoose = require('mongoose');

const connectionString = "mongodb://root:BcxobDtsHN5cIWaYXBAC2iyGpYDNl6nkT5uzkpZZFVhLfbTXK61uqd67bEKUPHBb@66.179.240.208:5999/?directConnection=true";

async function check() {
  try {
    await mongoose.connect(connectionString, { dbName: 'cartelbot' });
    
    const DiscordConnection = mongoose.model('DiscordConnection', new mongoose.Schema({}, { strict: false, collection: 'discordconnections' }));
    
    const allConnections = await DiscordConnection.find({}).lean();
    console.log('=== All Discord Connections ===');
    console.log('Total:', allConnections.length);
    allConnections.forEach(c => {
      console.log(JSON.stringify(c, null, 2));
    });
    
    const DiscordMessage = mongoose.model('DiscordMessage', new mongoose.Schema({}, { strict: false, collection: 'discordmessages' }));
    const totalMessages = await DiscordMessage.countDocuments({});
    console.log('\n=== Total Discord Messages:', totalMessages);
    
    if (totalMessages > 0) {
      const messages = await DiscordMessage.find({}).sort({ timestamp: -1 }).limit(10).lean();
      console.log('Recent messages:');
      messages.forEach(m => {
        console.log('- Message ID:', m.discordMessageId, 'Status:', m.processingStatus);
      });
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

check();

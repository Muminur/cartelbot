const mongoose = require('mongoose');

const connectionString = "mongodb://root:BcxobDtsHN5cIWaYXBAC2iyGpYDNl6nkT5uzkpZZFVhLfbTXK61uqd67bEKUPHBb@66.179.240.208:5999/?directConnection=true";

async function checkConnection() {
  try {
    await mongoose.connect(connectionString, { dbName: 'cartelbot' });
    console.log('Connected to MongoDB');
    
    const DiscordConnection = mongoose.model('DiscordConnection', new mongoose.Schema({}, { strict: false, collection: 'discordConnections' }));
    
    const connections = await DiscordConnection.find({}).lean();
    console.log('\n=== Discord Connections ===');
    console.log(JSON.stringify(connections, null, 2));
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkConnection();

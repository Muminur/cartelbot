const mongoose = require('mongoose');

const connectionString = "mongodb://root:BcxobDtsHN5cIWaYXBAC2iyGpYDNl6nkT5uzkpZZFVhLfbTXK61uqd67bEKUPHBb@66.179.240.208:5999/?directConnection=true";

async function check() {
  try {
    await mongoose.connect(connectionString, { dbName: 'cartelbot' });
    console.log('Connected to MongoDB\n');
    
    // List collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('=== Collections ===');
    collections.forEach(c => console.log(`- ${c.name}`));
    
    // Check users
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false, collection: 'users' }));
    const users = await User.find({}).limit(5).lean();
    console.log('\n=== Users (first 5) ===');
    users.forEach(u => {
      console.log(`- ${u.email} (ID: ${u._id})`);
    });
    
    // Check for any discord-related data
    if (collections.find(c => c.name.includes('discord'))) {
      const DiscordConnection = mongoose.model('DiscordConnection', new mongoose.Schema({}, { strict: false, collection: 'discordconnections' }));
      const dcCount = await DiscordConnection.countDocuments({});
      console.log(`\n=== Discord Connections Count: ${dcCount} ===`);
      
      if (dcCount > 0) {
        const sample = await DiscordConnection.findOne({}).lean();
        console.log('Sample:', JSON.stringify(sample, null, 2));
      }
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

check();

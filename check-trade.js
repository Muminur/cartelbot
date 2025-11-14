const mongoose = require('mongoose');

const DATABASE_URL = 'mongodb://root:BcxobDtsHN5cIWaYXBAC2iyGpYDNl6nkT5uzkpZZFVhLfbTXK61uqd67bEKUPHBb@66.179.240.208:5999/?directConnection=true';

async function checkTrade() {
  try {
    await mongoose.connect(DATABASE_URL, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });

    console.log('Connected to MongoDB');

    const Trade = mongoose.model('Trade', new mongoose.Schema({}, { strict: false }));

    // Try to find the most recent trade
    const recentTrades = await Trade.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    console.log('\n=== RECENT TRADES ===');
    console.log(JSON.stringify(recentTrades, null, 2));

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkTrade();

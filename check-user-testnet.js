const mongoose = require('mongoose');

const DATABASE_URL = 'mongodb://root:BcxobDtsHN5cIWaYXBAC2iyGpYDNl6nkT5uzkpZZFVhLfbTXK61uqd67bEKUPHBb@66.179.240.208:5999/?directConnection=true';

async function checkUserSettings() {
  try {
    await mongoose.connect(DATABASE_URL, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });

    console.log('Connected to MongoDB\n');

    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    const Trade = mongoose.model('Trade', new mongoose.Schema({}, { strict: false }));

    // Find the user from the trade
    const trade = await Trade.findOne({ _id: '6914633e3a224ebc9585c561' }).lean();
    console.log('=== TRADE DETAILS ===');
    console.log('Trade ID:', trade._id);
    console.log('User ID:', trade.userId);
    console.log('Order ID:', trade.buyOrder.orderId);
    console.log('Symbol:', trade.symbol);
    console.log('Quantity:', trade.quantity);

    const user = await User.findOne({ _id: trade.userId }).lean();
    console.log('\n=== USER SETTINGS ===');
    console.log('Email:', user.email);
    console.log('Use Testnet:', user.useTestnet);
    console.log('Has API Keys:', user.hasApiKeys);

    console.log('\n=== ANALYSIS ===');
    console.log('Order ID 14148 suggests:', trade.buyOrder.orderId < 100000 ? 'TESTNET' : 'MAINNET');
    console.log('User preference:', user.useTestnet ? 'TESTNET' : 'MAINNET');

    if (user.useTestnet && trade.buyOrder.orderId > 100000) {
      console.log('\n⚠️  WARNING: Order ID suggests MAINNET but user preference is TESTNET');
      console.log('This is likely causing the "Insufficient balance" error!');
      console.log('The buy order executed on MAINNET, but OCO orders are trying TESTNET.');
    } else if (!user.useTestnet && trade.buyOrder.orderId < 100000) {
      console.log('\n⚠️  WARNING: Order ID suggests TESTNET but user preference is MAINNET');
      console.log('This is likely causing the "Insufficient balance" error!');
      console.log('The buy order executed on TESTNET, but OCO orders are trying MAINNET.');
    } else {
      console.log('\n✅ Buy and OCO orders are using the same network');
      console.log('The issue is NOT testnet/mainnet mismatch');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUserSettings();

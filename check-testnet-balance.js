const axios = require('axios');
const crypto = require('crypto');
const mongoose = require('mongoose');

const DATABASE_URL = 'mongodb://root:BcxobDtsHN5cIWaYXBAC2iyGpYDNl6nkT5uzkpZZFVhLfbTXK61uqd67bEKUPHBb@66.179.240.208:5999/?directConnection=true';
const BASE_URL = 'https://testnet.binance.vision';

function createSignature(queryString, apiSecret) {
  return crypto
    .createHmac('sha256', apiSecret)
    .update(queryString)
    .digest('hex');
}

function decrypt(encryptedData) {
  // Simple base64 decode for demonstration (actual implementation uses AES-256-GCM)
  // This won't work without the encryption key
  return null;
}

async function checkBalance() {
  try {
    await mongoose.connect(DATABASE_URL, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });

    console.log('Connected to MongoDB\n');

    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));

    // Find the user
    const user = await User.findOne({ email: 'mentorpid@gmail.com' })
      .select('+binance.apiKey +binance.apiSecret')
      .lean();

    if (!user || !user.binance || !user.binance.apiKey) {
      console.error('User API keys not found');
      process.exit(1);
    }

    console.log('=== USER FOUND ===');
    console.log('Email:', user.email);
    console.log('Encrypted API Key:', user.binance.apiKey.substring(0, 50) + '...');

    console.log('\n❌ Cannot decrypt API keys without ENCRYPTION_KEY environment variable');
    console.log('To check balance, you need to:');
    console.log('1. Get the decrypted API key and secret from the user');
    console.log('2. Or run this in the Next.js server context where decrypt() works');

    console.log('\n=== WHAT TO CHECK MANUALLY ===');
    console.log('1. Log into Binance Testnet with the user\'s API keys');
    console.log('2. Check RAD balance - should be 233.6 RAD');
    console.log('3. Check if there are any existing open orders for RADUSDT');
    console.log('4. If balance shows 0, the buy order might not have settled yet');

    console.log('\n=== LIKELY ISSUE ===');
    console.log('The "Insufficient balance" error for OCO orders suggests:');
    console.log('1. Buy order filled, but balance not yet available');
    console.log('2. RAD locked in another order');
    console.log('3. Testnet account reset (Binance testnet resets periodically)');

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkBalance();

/**
 * Test script to verify useTestnet value in database
 * Run: node test-testnet-value.js
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

const userSchema = new mongoose.Schema({
  email: String,
  useTestnet: Boolean,
  investmentAmount: Number,
  positionSizingMethod: String,
  riskPercentage: Number,
  targetDistribution: [Number],
  maxPositionSize: Number,
  maxDailyLoss: Number,
  maxOpenPositions: Number,
  requireApproval: Boolean,
  emergencyStop: Boolean,
});

const User = mongoose.model('User', userSchema);

async function testTestnetValue() {
  try {
    console.log('[TEST] Connecting to MongoDB...');
    await mongoose.connect(process.env.DATABASE_URL, {
      serverSelectionTimeoutMS: 30000,
    });
    console.log('[TEST] Connected successfully\n');

    // Find all users and display their testnet settings
    const users = await User.find({}).select('email useTestnet investmentAmount positionSizingMethod');

    console.log('[TEST] User Testnet Settings:');
    console.log('='.repeat(80));

    if (users.length === 0) {
      console.log('No users found in database');
    } else {
      users.forEach((user, index) => {
        console.log(`\nUser ${index + 1}:`);
        console.log(`  Email: ${user.email}`);
        console.log(`  useTestnet: ${user.useTestnet} (type: ${typeof user.useTestnet})`);
        console.log(`  investmentAmount: ${user.investmentAmount}`);
        console.log(`  positionSizingMethod: ${user.positionSizingMethod}`);

        // Highlight if testnet is enabled
        if (user.useTestnet === true) {
          console.log('  ✅ TESTNET ENABLED');
        } else if (user.useTestnet === false) {
          console.log('  ⚠️  MAINNET (testnet disabled)');
        } else {
          console.log('  ❓ UNDEFINED (will default to mainnet)');
        }
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('[TEST] Test completed successfully');

  } catch (error) {
    console.error('[TEST] Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('[TEST] Disconnected from MongoDB');
  }
}

testTestnetValue();

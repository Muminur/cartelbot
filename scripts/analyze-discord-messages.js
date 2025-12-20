const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

async function analyzeMessages() {
  await mongoose.connect(process.env.DATABASE_URL);

  const DiscordMessage = mongoose.model('DiscordMessage', new mongoose.Schema({}, { strict: false, collection: 'discordmessages' }));
  const Signal = mongoose.model('Signal', new mongoose.Schema({}, { strict: false, collection: 'signals' }));
  const Trade = mongoose.model('Trade', new mongoose.Schema({}, { strict: false, collection: 'trades' }));

  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║           DISCORD MESSAGE DETECTION ANALYSIS REPORT                        ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  const messages = await DiscordMessage.find({})
    .sort({ timestamp: -1 })
    .limit(2)
    .lean();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    console.log(`\n${'='.repeat(80)}`);
    console.log(`MESSAGE ${i + 1}: ${msg.authorUsername}`);
    console.log('='.repeat(80));

    console.log('\n📨 DETECTION PHASE:');
    console.log('  ├─ Received:', new Date(msg.timestamp).toLocaleString());
    console.log('  ├─ Discord ID:', msg.discordMessageId);
    console.log('  ├─ Author:', msg.authorUsername);
    console.log('  ├─ Channel ID:', msg.channelId);
    console.log('  └─ Content Length:', msg.content.length, 'chars\n');

    console.log('📝 MESSAGE CONTENT:');
    console.log('  ' + msg.content.split('\n').join('\n  '));

    console.log('\n🔍 PARSING PHASE:');
    console.log('  ├─ Processing Status:', msg.processingStatus || 'UNDEFINED (BUG!)');
    console.log('  ├─ Parse Errors:', msg.parseErrors?.length || 0);

    if (msg.parsedSignal) {
      console.log('  ├─ Parsed Signal: ✅ SUCCESS');
      console.log('  │  ├─ Symbol:', msg.parsedSignal.symbol);
      console.log('  │  ├─ Entry Prices:', msg.parsedSignal.entries.join(', '));
      console.log('  │  ├─ Targets:', msg.parsedSignal.targets.join(', '));
      console.log('  │  ├─ Stop Loss:', msg.parsedSignal.stopLoss);
      console.log('  │  └─ Confidence:', msg.parsedSignal.confidence + '%');
    } else {
      console.log('  ├─ Parsed Signal: ❌ NOT FOUND');
    }

    // Get signal details
    if (msg.signalId) {
      const signal = await Signal.findById(msg.signalId).lean();
      console.log('  └─ Signal Created: ✅ ID:', String(msg.signalId).slice(-8));

      if (signal) {
        console.log('\n📊 SIGNAL DETAILS:');
        console.log('  ├─ Symbol:', signal.symbol);
        console.log('  ├─ Status:', signal.status);
        console.log('  ├─ Entries:', signal.entries.join(', '));
        console.log('  ├─ Targets:', signal.targets.join(', '));
        console.log('  ├─ Stop Loss:', signal.stopLoss);
        console.log('  └─ Created:', new Date(signal.createdAt).toLocaleString());
      }
    } else {
      console.log('  └─ Signal Created: ❌ NO SIGNAL');
    }

    // Get trade details
    console.log('\n💰 TRADE EXECUTION PHASE:');
    if (msg.tradeId) {
      const trade = await Trade.findById(msg.tradeId).lean();
      if (trade) {
        console.log('  ├─ Trade Created: ✅ ID:', String(msg.tradeId).slice(-8));
        console.log('  ├─ Status:', trade.status);
        console.log('  ├─ Buy Order ID:', trade.buyOrder?.orderId || 'None');
        console.log('  ├─ Investment:', trade.investedAmount, 'USDT');
        console.log('  ├─ Quantity:', trade.quantity, trade.symbol?.replace('USDT', ''));
        console.log('  ├─ Sell Orders:', trade.sellOrders?.length || 0, 'OCO orders');
        console.log('  └─ Created:', new Date(trade.createdAt).toLocaleString());
      }
    } else if (msg.executionError) {
      console.log('  ├─ Trade Created: ❌ FAILED');
      console.log('  └─ Error:', msg.executionError);
    } else {
      console.log('  └─ Trade Created: ⏳ NOT EXECUTED (Auto-execute may be OFF)');
    }

    console.log('\n🎯 FINAL STATUS:');
    const actualStatus = msg.processingStatus || 'undefined (SCHEMA BUG!)';
    console.log('  ├─ Processing Status:', actualStatus);
    console.log('  ├─ Has Signal:', msg.signalId ? '✅ YES' : '❌ NO');
    console.log('  ├─ Has Trade:', msg.tradeId ? '✅ YES' : '❌ NO');
    console.log('  └─ Fully Executed:', (msg.signalId && msg.tradeId) ? '✅ YES' : '❌ NO');

    if (actualStatus.includes('undefined')) {
      console.log('\n⚠️  ISSUE DETECTED:');
      console.log('  The UI shows "Pending" because it\'s reading the wrong field name!');
      console.log('  - UI looks for: message.status');
      console.log('  - Database has: message.processingStatus');
      console.log('  - Fix applied: Updated TypeScript interface to match schema');
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('END OF REPORT');
  console.log('='.repeat(80) + '\n');

  await mongoose.disconnect();
  process.exit(0);
}

analyzeMessages().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

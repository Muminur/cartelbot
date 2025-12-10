const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

mongoose.connect(process.env.DATABASE_URL)
  .then(async () => {
    const DiscordMessage = mongoose.model('DiscordMessage', new mongoose.Schema({}, { strict: false, collection: 'discordmessages' }));

    const messages = await DiscordMessage.find({})
      .sort({ timestamp: -1 })
      .limit(5)
      .lean();

    console.log('Recent Discord Messages:');
    console.log('========================\n');

    messages.forEach((msg, i) => {
      console.log(`Message ${i + 1}:`);
      console.log('Content:', msg.content?.substring(0, 100));
      console.log('Author:', msg.authorUsername);
      console.log('Channel:', msg.channelName);
      console.log('Status:', msg.status);
      console.log('Is Signal:', msg.isSignal);
      console.log('Parse Error:', msg.parseError || 'None');
      console.log('Execution Error:', msg.executionError || 'None');
      console.log('Signal ID:', msg.signalId || 'None');
      console.log('Trade ID:', msg.tradeId || 'None');
      console.log('Timestamp:', new Date(msg.timestamp).toLocaleString());
      console.log('---\n');
    });

    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });

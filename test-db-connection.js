const mongoose = require('mongoose');

const DATABASE_URL = 'mongodb://root:BcxobDtsHN5cIWaYXBAC2iyGpYDNl6nkT5uzkpZZFVhLfbTXK61uqd67bEKUPHBb@66.179.240.208:5999/?directConnection=true';

console.log('Testing MongoDB connection to 66.179.240.208:5999...');
console.log('Attempting connection with 30 second timeout...\n');

const startTime = Date.now();

mongoose.connect(DATABASE_URL, {
  serverSelectionTimeoutMS: 30000,
  connectTimeoutMS: 30000,
  socketTimeoutMS: 45000,
})
.then(() => {
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`✅ SUCCESS: Connected to MongoDB in ${duration}s`);
  console.log('Connection state:', mongoose.connection.readyState);
  console.log('Database name:', mongoose.connection.name);

  return mongoose.connection.db.admin().ping();
})
.then((pingResult) => {
  console.log('Ping result:', pingResult);
  return mongoose.disconnect();
})
.then(() => {
  console.log('\n✅ Test completed successfully');
  process.exit(0);
})
.catch((error) => {
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.error(`\n❌ FAILED after ${duration}s`);
  console.error('Error name:', error.name);
  console.error('Error message:', error.message);

  if (error.reason) {
    console.error('\nDetailed error reason:');
    console.error('- Type:', error.reason.type);
    console.error('- Code:', error.reason.code);
    console.error('- Servers checked:', error.reason.servers ? error.reason.servers.size : 0);
  }

  console.error('\nPossible causes:');
  console.error('1. MongoDB server is not running');
  console.error('2. Firewall blocking port 5999');
  console.error('3. VPS network configuration issue');
  console.error('4. Incorrect credentials or IP address');
  console.error('5. MongoDB not bound to external interface (0.0.0.0)');

  process.exit(1);
});

setTimeout(() => {
  console.error('\n⏰ TIMEOUT: Connection attempt exceeded 35 seconds');
  process.exit(1);
}, 35000);

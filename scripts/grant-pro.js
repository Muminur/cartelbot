/**
 * Script to grant Pro (unlimited) subscription to a user
 * Usage: node scripts/grant-pro.js <email>
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Read .env.local file
const envPath = path.join(__dirname, '..', '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('❌ .env.local file not found');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf-8');
const envLines = envContent.split('\n');
envLines.forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const value = match[2].trim().replace(/^["'](.*)["']$/, '$1');
    process.env[key] = value;
  }
});

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in .env.local');
  process.exit(1);
}

const userSchema = new mongoose.Schema({
  email: String,
  subscriptionTier: String,
  subscriptionExpiry: Date,
});

async function grantProSubscription(email) {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(DATABASE_URL);

    const User = mongoose.model('User', userSchema);

    console.log(`Looking up user: ${email}`);
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      console.error(`❌ User not found: ${email}`);
      console.log('\nAvailable users:');
      const allUsers = await User.find({}, { email: 1, subscriptionTier: 1 });
      allUsers.forEach(u => {
        console.log(`  - ${u.email} (${u.subscriptionTier || 'free'})`);
      });
      process.exit(1);
    }

    console.log(`\nCurrent subscription status:`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Current Tier: ${user.subscriptionTier || 'free'}`);
    console.log(`  Expiry: ${user.subscriptionExpiry || 'None'}`);

    // Update to Pro tier with far-future expiry date (100 years)
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 100);

    user.subscriptionTier = 'pro';
    user.subscriptionExpiry = expiryDate;
    await user.save();

    console.log(`\n✅ Successfully upgraded to Pro subscription!`);
    console.log(`\nNew subscription status:`);
    console.log(`  Email: ${user.email}`);
    console.log(`  New Tier: ${user.subscriptionTier}`);
    console.log(`  Expiry: ${user.subscriptionExpiry.toISOString()}`);
    console.log(`\n📊 Benefits:`);
    console.log(`  - Unlimited signal submissions per month`);
    console.log(`  - Up to 50 maximum open positions`);
    console.log(`  - All premium features included`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error granting subscription:', error.message);
    process.exit(1);
  }
}

// Get email from command line arguments
const email = process.argv[2];

if (!email) {
  console.error('❌ Usage: node scripts/grant-pro.js <email>');
  console.error('Example: node scripts/grant-pro.js mentorpid@gmail.com');
  process.exit(1);
}

grantProSubscription(email);

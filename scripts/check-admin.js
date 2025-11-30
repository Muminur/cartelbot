/**
 * Check and create admin account in MongoDB
 * Usage: node scripts/check-admin.js
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Read environment variables from .env.local manually
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    let value = match[2].trim();
    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    envVars[key] = value;
    process.env[key] = value;
  }
});

const ADMIN_SCHEMA = new mongoose.Schema({
  username: String,
  passwordHash: String,
  email: String,
  isActive: Boolean,
  loginAttempts: Number,
  lockUntil: Date,
}, { timestamps: true });

async function main() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.DATABASE_URL);
    console.log('✓ Connected to MongoDB\n');

    const Admin = mongoose.models.Admin || mongoose.model('Admin', ADMIN_SCHEMA);

    // Check for existing admin accounts
    const admins = await Admin.find({}).select('+passwordHash');
    console.log(`Found ${admins.length} admin account(s):\n`);

    if (admins.length === 0) {
      console.log('No admin accounts found. Creating default admin...\n');

      // Use password hash from .env.local
      const passwordHash = process.env.ADMIN_PASSWORD_HASH;
      const username = process.env.ADMIN_USERNAME || 'admin';

      if (!passwordHash) {
        console.error('ERROR: ADMIN_PASSWORD_HASH not found in .env.local');
        console.error('Please add ADMIN_PASSWORD_HASH to .env.local');
        process.exit(1);
      }

      const newAdmin = new Admin({
        username: username,
        passwordHash: passwordHash,
        email: 'admin@cartelbot.coinspree.cc',
        isActive: true,
        loginAttempts: 0,
      });

      await newAdmin.save();
      console.log(`✓ Created admin account: ${username}`);
      console.log(`  Password: Use the password that generated the hash in ADMIN_PASSWORD_HASH\n`);
    } else {
      admins.forEach((admin, i) => {
        console.log(`${i + 1}. Username: ${admin.username}`);
        console.log(`   Email: ${admin.email || 'Not set'}`);
        console.log(`   Active: ${admin.isActive}`);
        console.log(`   Login Attempts: ${admin.loginAttempts}`);
        console.log(`   Locked Until: ${admin.lockUntil || 'Not locked'}`);
        console.log(`   Password Hash: ${admin.passwordHash?.substring(0, 20)}...`);
        console.log('');
      });
    }

    // Check for users (regular users)
    const User = mongoose.model('User', new mongoose.Schema({ email: String }));
    const users = await User.find({});
    console.log(`\nFound ${users.length} regular user(s):`);
    users.forEach((user, i) => {
      console.log(`${i + 1}. ${user.email}`);
    });

    console.log('\n✓ Admin check complete');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main();

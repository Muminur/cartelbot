/**
 * Update admin account email in MongoDB
 * Usage: node scripts/update-admin-email.js
 */

const mongoose = require('mongoose');

// Read environment variables from .env.local manually
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
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

    const admin = await Admin.findOne({ username: 'admin' });

    if (!admin) {
      console.error('ERROR: Admin account not found');
      process.exit(1);
    }

    console.log(`Current admin email: ${admin.email || 'Not set'}`);

    // Update email to match ADMIN_EMAILS in .env.local
    const adminEmail = process.env.ADMIN_EMAILS?.split(',')[0]?.trim() || 'admin@cartelbot.coinspree.cc';

    admin.email = adminEmail;
    await admin.save();

    console.log(`✓ Updated admin email to: ${adminEmail}\n`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main();

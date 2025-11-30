/**
 * Set admin account email to mentorpid@gmail.com
 * Usage: node scripts/set-admin-email.js
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
    console.log('DATABASE_URL:', process.env.DATABASE_URL?.substring(0, 30) + '...');
    await mongoose.connect(process.env.DATABASE_URL);
    console.log('✓ Connected to MongoDB\n');

    const Admin = mongoose.models.Admin || mongoose.model('Admin', ADMIN_SCHEMA);

    const admin = await Admin.findOne({ username: 'admin' });

    if (!admin) {
      console.error('ERROR: Admin account not found');
      process.exit(1);
    }

    console.log(`Current admin email: ${admin.email || 'Not set'}`);
    console.log(`ADMIN_EMAILS from .env.local: ${process.env.ADMIN_EMAILS}`);

    // Set to mentorpid@gmail.com directly
    const newEmail = 'mentorpid@gmail.com';

    admin.email = newEmail;
    await admin.save();

    console.log(`✓ Updated admin email to: ${newEmail}\n`);

    // Verify the update
    const verifyAdmin = await Admin.findOne({ username: 'admin' });
    console.log(`Verified email in database: ${verifyAdmin.email}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main();

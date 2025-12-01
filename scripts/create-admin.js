/**
 * Admin Account Creation Script
 *
 * Creates or updates admin account in MongoDB with bcrypt-hashed password.
 * This is the ONLY way to manage admin credentials - they are NOT stored in .env files.
 *
 * Usage:
 *   node scripts/create-admin.js
 *   node scripts/create-admin.js --username custom --password secure123
 *   node scripts/create-admin.js --email admin@example.com
 *
 * Security Notes:
 * - Passwords are hashed with bcrypt (10 salt rounds)
 * - Hashes are stored in MongoDB 'admins' collection
 * - Default credentials: admin / admin123 (CHANGE IN PRODUCTION!)
 */

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");

// Manual .env file loader (no dotenv dependency needed)
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  content.split("\n").forEach((line) => {
    line = line.trim();
    if (!line || line.startsWith("#")) return;

    const match = line.match(/^([^=]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      // Remove quotes if present
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  });
}

// Load environment variables from .env files
loadEnvFile(path.resolve(__dirname, "../.env.local"));
loadEnvFile(path.resolve(__dirname, "../.env"));

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (name, defaultValue) => {
  const index = args.indexOf(`--${name}`);
  return index !== -1 && args[index + 1] ? args[index + 1] : defaultValue;
};

const USERNAME = getArg("username", "admin");
const PASSWORD = getArg("password", "admin123");
const EMAIL = getArg("email", process.env.ADMIN_EMAILS?.split(",")[0]?.trim() || "");

// Validation
if (!process.env.DATABASE_URL) {
  console.error("❌ Error: DATABASE_URL not found in environment variables");
  console.error("   Make sure .env.local or .env exists with DATABASE_URL configured");
  process.exit(1);
}

if (USERNAME.length < 3 || USERNAME.length > 50) {
  console.error("❌ Error: Username must be 3-50 characters");
  process.exit(1);
}

if (PASSWORD.length < 6) {
  console.error("❌ Error: Password must be at least 6 characters");
  process.exit(1);
}

if (EMAIL && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(EMAIL)) {
  console.error("❌ Error: Invalid email format");
  process.exit(1);
}

// Admin Schema (inline to avoid dependency issues)
const adminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastLogin: Date,
  loginAttempts: {
    type: Number,
    default: 0,
  },
  lockUntil: Date,
}, { timestamps: true });

async function main() {
  try {
    console.log("\n🔐 Admin Account Setup\n");
    console.log("Configuration:");
    console.log(`  Database: ${process.env.DATABASE_URL.replace(/\/\/.*:.*@/, "//***:***@")}`);
    console.log(`  Username: ${USERNAME}`);
    console.log(`  Password: ${"*".repeat(PASSWORD.length)}`);
    console.log(`  Email:    ${EMAIL || "(none)"}\n`);

    // Connect to MongoDB
    console.log("📡 Connecting to MongoDB...");
    await mongoose.connect(process.env.DATABASE_URL, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log("✅ Connected to MongoDB\n");

    // Get or create Admin model
    const Admin = mongoose.models.Admin || mongoose.model("Admin", adminSchema);

    // Hash password
    console.log("🔒 Hashing password with bcrypt...");
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    console.log(`✅ Password hashed (${passwordHash.length} characters)\n`);

    // Check if admin exists
    const existingAdmin = await Admin.findOne({ username: USERNAME });

    if (existingAdmin) {
      console.log(`⚠️  Admin '${USERNAME}' already exists - updating credentials...`);

      existingAdmin.passwordHash = passwordHash;
      if (EMAIL) existingAdmin.email = EMAIL;
      existingAdmin.isActive = true;
      existingAdmin.loginAttempts = 0;
      existingAdmin.lockUntil = undefined;

      await existingAdmin.save();

      console.log("✅ Admin account updated successfully!\n");
    } else {
      console.log(`➕ Creating new admin '${USERNAME}'...`);

      const newAdmin = new Admin({
        username: USERNAME,
        passwordHash,
        email: EMAIL || undefined,
        isActive: true,
        loginAttempts: 0,
      });

      await newAdmin.save();

      console.log("✅ Admin account created successfully!\n");
    }

    // Display final credentials
    console.log("📋 Admin Credentials:");
    console.log(`   Username: ${USERNAME}`);
    console.log(`   Password: ${PASSWORD}`);
    if (EMAIL) console.log(`   Email:    ${EMAIL}`);
    console.log("\n⚠️  SECURITY NOTICE:");
    console.log("   - Change the default password in production!");
    console.log("   - Passwords are stored as bcrypt hashes in MongoDB");
    console.log("   - JWT tokens are signed using JWT_SECRET from .env");
    console.log("\n🎉 Setup complete! You can now log in at /admin/login\n");

  } catch (error) {
    console.error("\n❌ Error:", error.message);
    if (error.code === 11000) {
      console.error("   Duplicate key error - admin might exist with different case");
    }
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

main();

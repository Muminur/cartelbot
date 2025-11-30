/**
 * Admin Setup Script
 *
 * Creates or updates the admin account in MongoDB.
 *
 * Usage:
 *   npm run setup-admin
 *
 * Environment variables:
 *   ADMIN_USERNAME (optional, default: admin)
 *   ADMIN_PASSWORD (required)
 *   ADMIN_EMAIL (optional)
 */

import { connectDB, disconnectDB } from "../lib/db";
import { Admin } from "../lib/db/models";
import bcrypt from "bcryptjs";

// Note: Environment variables are automatically loaded by Next.js from .env.local

const BCRYPT_ROUNDS = 10;

async function setupAdmin() {
  let hasError = false;
  try {
    console.log("🔗 Connecting to database...");
    await connectDB();
    console.log("✅ Connected to database");

    // Get admin credentials from environment
    const username = process.env.ADMIN_USERNAME || "admin";
    const password = process.env.ADMIN_PASSWORD;
    const email = process.env.ADMIN_EMAIL;

    if (!password) {
      throw new Error(
        "ADMIN_PASSWORD environment variable is required.\nUsage: ADMIN_PASSWORD=your_secure_password npm run setup-admin"
      );
    }

    // Validate password strength
    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters long");
    }

    console.log(`\n👤 Setting up admin account: ${username}`);

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ username }).select("+passwordHash");

    if (existingAdmin) {
      console.log("⚠️  Admin account already exists");

      // Ask for confirmation (in production, this would be interactive)
      console.log("🔄 Updating password...");

      // Hash new password
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      // Update admin
      existingAdmin.passwordHash = passwordHash;
      if (email) existingAdmin.email = email;
      existingAdmin.isActive = true;
      existingAdmin.loginAttempts = 0;
      existingAdmin.lockUntil = undefined;

      await existingAdmin.save();
      console.log("✅ Admin account updated successfully");
    } else {
      console.log("📝 Creating new admin account...");

      // Hash password
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      // Create new admin
      const admin = new Admin({
        username,
        passwordHash,
        email,
        isActive: true,
        loginAttempts: 0,
      });

      await admin.save();
      console.log("✅ Admin account created successfully");
    }

    console.log("\n📊 Admin Account Details:");
    console.log(`   Username: ${username}`);
    console.log(`   Email: ${email || "Not set"}`);
    console.log(`   Password: ${password.replace(/./g, "*")}`);
    console.log(`   Status: Active`);

    console.log("\n🎉 Admin setup complete!");
    console.log("\n⚠️  IMPORTANT:");
    console.log("   1. Delete ADMIN_PASSWORD from your environment after running this script");
    console.log("   2. Never commit ADMIN_PASSWORD to version control");
    console.log(
      "   3. You can now remove ADMIN_PASSWORD_HASH from .env.local (using database auth now)"
    );
  } catch (error) {
    console.error("\n❌ Error setting up admin:", error);
    hasError = true;
  } finally {
    await disconnectDB();
    console.log("\n🔌 Disconnected from database");
    process.exit(hasError ? 1 : 0);
  }
}

// Run the setup
setupAdmin();

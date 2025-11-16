/**
 * Script to grant Pro (unlimited) subscription to a user
 * Usage: npx ts-node scripts/grant-pro-subscription.ts <email>
 */

import { connectDB } from "../lib/db/connection";
import { User } from "../lib/db/models/User";

async function grantProSubscription(email: string) {
  try {
    console.log("Connecting to database...");
    await connectDB();

    console.log(`Looking up user: ${email}`);
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      console.error(`❌ User not found: ${email}`);
      console.log("\nAvailable users:");
      const allUsers = await User.find({}, { email: 1, subscriptionTier: 1 });
      allUsers.forEach((u: any) => {
        console.log(`  - ${u.email} (${u.subscriptionTier})`);
      });
      process.exit(1);
    }

    console.log(`\nCurrent subscription status:`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Current Tier: ${user.subscriptionTier}`);
    console.log(`  Expiry: ${user.subscriptionExpiry || "None"}`);

    // Update to Pro tier with far-future expiry date (100 years)
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 100);

    user.subscriptionTier = "pro";
    user.subscriptionExpiry = expiryDate;
    await user.save();

    console.log(`\n✅ Successfully upgraded to Pro subscription!`);
    console.log(`\nNew subscription status:`);
    console.log(`  Email: ${user.email}`);
    console.log(`  New Tier: ${user.subscriptionTier}`);
    console.log(`  Expiry: ${user.subscriptionExpiry?.toISOString()}`);
    console.log(`\n📊 Benefits:`);
    console.log(`  - Unlimited signal submissions per month`);
    console.log(`  - Up to 50 maximum open positions`);
    console.log(`  - All premium features included`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error granting subscription:", error);
    process.exit(1);
  }
}

// Get email from command line arguments
const email = process.argv[2];

if (!email) {
  console.error("❌ Usage: npx ts-node scripts/grant-pro-subscription.ts <email>");
  console.error("Example: npx ts-node scripts/grant-pro-subscription.ts mentorpid@gmail.com");
  process.exit(1);
}

grantProSubscription(email);

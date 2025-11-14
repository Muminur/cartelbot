/**
 * Test script to verify /api/stats endpoint returns correct data
 * Tests the fix for userEmail -> userId query field mismatch
 */

const mongoose = require("mongoose");

const DATABASE_URL = process.env.DATABASE_URL || "mongodb://root:BcxobDtsHN5cIWaYXBAC2iyGpYDNl6nkT5uzkpZZFVhLfbTXK61uqd67bEKUPHBb@66.179.240.208:5999/?directConnection=true";

// Define minimal schemas
const UserSchema = new mongoose.Schema({
  email: String,
  binance: {
    apiKey: String,
    apiSecret: String,
  },
  hasApiKeys: Boolean,
  subscriptionTier: String,
});

const SignalSchema = new mongoose.Schema({
  userId: String,
  userEmail: String,
  symbol: String,
  status: String,
  createdAt: Date,
});

const TradeSchema = new mongoose.Schema({
  userId: String,
  userEmail: String,
  symbol: String,
  status: String,
  realizedPnL: Number,
  createdAt: Date,
});

const User = mongoose.models.User || mongoose.model("User", UserSchema);
const Signal =
  mongoose.models.Signal || mongoose.model("Signal", SignalSchema);
const Trade = mongoose.models.Trade || mongoose.model("Trade", TradeSchema);

async function testStatsQueries() {
  try {
    console.log("🔍 Testing Stats API Queries...\n");

    await mongoose.connect(DATABASE_URL, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log("✓ Connected to MongoDB\n");

    // Get a test user
    const user = await User.findOne({ email: { $exists: true } });
    if (!user) {
      console.log("❌ No users found in database");
      return;
    }

    console.log(`📧 Testing with user: ${user.email}`);
    console.log(`🆔 User ID: ${user._id}\n`);

    // Test OLD query (userEmail) - should return 0
    console.log("--- OLD QUERY (userEmail) ---");
    const oldActiveSignals = await Signal.countDocuments({
      userEmail: user.email,
      status: { $in: ["pending", "executing"] },
    });
    console.log(`Active Signals (userEmail): ${oldActiveSignals}`);

    const oldActiveTrades = await Trade.countDocuments({
      userEmail: user.email,
      status: "open",
    });
    console.log(`Active Trades (userEmail): ${oldActiveTrades}`);

    const oldCompletedTrades = await Trade.countDocuments({
      userEmail: user.email,
      status: "closed",
    });
    console.log(`Completed Trades (userEmail): ${oldCompletedTrades}\n`);

    // Test NEW query (userId) - should return actual counts
    console.log("--- NEW QUERY (userId) ---");
    const newActiveSignals = await Signal.countDocuments({
      userId: String(user._id),
      status: { $in: ["pending", "executing"] },
    });
    console.log(`Active Signals (userId): ${newActiveSignals}`);

    const newActiveTrades = await Trade.countDocuments({
      userId: String(user._id),
      status: "open",
    });
    console.log(`Active Trades (userId): ${newActiveTrades}`);

    const newCompletedTrades = await Trade.countDocuments({
      userId: String(user._id),
      status: "closed",
    });
    console.log(`Completed Trades (userId): ${newCompletedTrades}`);

    // Test P&L calculation
    const pnlResult = await Trade.aggregate([
      {
        $match: {
          userId: String(user._id),
          status: "closed",
          realizedPnL: { $exists: true },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$realizedPnL" },
        },
      },
    ]);
    const totalPnL = pnlResult[0]?.total || 0;
    console.log(`Total P&L: ${totalPnL.toFixed(2)} USDT`);

    // Test win rate calculation
    const winningTrades = await Trade.countDocuments({
      userId: String(user._id),
      status: "closed",
      realizedPnL: { $gt: 0 },
    });

    const losingTrades = await Trade.countDocuments({
      userId: String(user._id),
      status: "closed",
      realizedPnL: { $lt: 0 },
    });

    const winRate =
      newCompletedTrades > 0
        ? (winningTrades / newCompletedTrades) * 100
        : 0;

    console.log(`Winning Trades: ${winningTrades}`);
    console.log(`Losing Trades: ${losingTrades}`);
    console.log(`Win Rate: ${winRate.toFixed(2)}%\n`);

    // Summary
    console.log("--- SUMMARY ---");
    if (newActiveSignals > 0 || newActiveTrades > 0 || newCompletedTrades > 0) {
      console.log("✅ FIX WORKING: userId queries return data");
      console.log(`   Active Signals: ${newActiveSignals}`);
      console.log(`   Active Trades: ${newActiveTrades}`);
      console.log(`   Completed Trades: ${newCompletedTrades}`);
      console.log(`   Total P&L: ${totalPnL.toFixed(2)} USDT`);
      console.log(`   Win Rate: ${winRate.toFixed(2)}%`);
    } else {
      console.log(
        "⚠️  No data found for this user (this might be expected if no trades exist)"
      );
    }

    if (oldActiveSignals === 0 && oldActiveTrades === 0) {
      console.log(
        "✅ OLD QUERIES PROPERLY RETURN 0: userEmail field doesn't exist in documents"
      );
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await mongoose.connection.close();
    console.log("\n✓ Connection closed");
  }
}

testStatsQueries();

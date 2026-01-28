import { User, Signal, Trade, Subscription, WebSocketSession } from "./models";
import { Types } from "mongoose";
import { UserWithEncryptedKeys } from "@/types";

export async function findUserByEmail(email: string) {
  return await User.findOne({ email: email.toLowerCase() }).lean();
}

export async function findUserById(userId: string) {
  if (!Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID format");
  }
  return await User.findById(userId).lean();
}

/**
 * Retrieves user with encrypted API keys from database
 * @param userId - User ID (string, ObjectId, or unknown)
 * @returns User object with encrypted keys or null if not found
 * @throws Error if user ID is invalid
 */
export async function getUserApiKeys(
  userId: string | Types.ObjectId | unknown
): Promise<UserWithEncryptedKeys | null> {
  const id = userId instanceof Types.ObjectId ? userId.toString() : String(userId);
  if (!Types.ObjectId.isValid(id)) {
    throw new Error("Invalid user ID format");
  }
  return await User.findById(id)
    .select("+encryptedApiKey +encryptedApiSecret useTestnet")
    .lean<UserWithEncryptedKeys>();
}

export async function updateUserSubscription(
  userId: string,
  tier: "free" | "premium" | "pro",
  expiryDate: Date
) {
  if (!Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID format");
  }
  return await User.findByIdAndUpdate(
    userId,
    {
      subscriptionTier: tier,
      subscriptionExpiry: expiryDate,
    },
    { new: true }
  ).lean();
}

export async function getUserActiveSignals(userId: string) {
  if (!Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID format");
  }
  return await Signal.find({
    userId,
    status: { $in: ["pending", "parsed", "executing"] },
  })
    .sort({ createdAt: -1 })
    .limit(100) // Prevent unbounded queries - limit to 100 most recent active signals
    .lean();
}

export async function getUserOpenTrades(userId: string) {
  if (!Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID format");
  }
  return await Trade.find({
    userId,
    status: { $in: ["open", "partial"] },
  })
    .sort({ createdAt: -1 })
    .limit(100) // Prevent unbounded queries - limit to 100 most recent open trades
    .lean();
}

export async function getActiveWebSocketSession(userId: string) {
  if (!Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID format");
  }
  return await WebSocketSession.findOne({
    userId,
    isActive: true,
    connectionState: { $in: ["connected", "connecting"] },
  }).lean();
}

export async function updateWebSocketKeepAlive(listenKey: string) {
  return await WebSocketSession.findOneAndUpdate(
    { listenKey },
    { lastKeepAlive: new Date() },
    { new: true }
  ).lean();
}

export async function getUserActiveSubscription(userId: string) {
  if (!Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID format");
  }
  return await Subscription.findOne({
    userId,
    status: "confirmed",
    endDate: { $gte: new Date() },
  })
    .sort({ endDate: -1 })
    .lean();
}

export async function isUserSubscriptionActive(userId: string): Promise<boolean> {
  if (!Types.ObjectId.isValid(userId)) {
    return false;
  }

  const user = await User.findById(userId).lean<{
    subscriptionTier: "free" | "premium" | "pro";
    subscriptionExpiry?: Date;
  }>();

  if (!user) return false;

  if (user.subscriptionTier === "free") return true;

  if (user.subscriptionExpiry && new Date(user.subscriptionExpiry) > new Date()) {
    return true;
  }

  return false;
}

export async function getTradesBySignal(signalId: string) {
  if (!Types.ObjectId.isValid(signalId)) {
    throw new Error("Invalid signal ID format");
  }
  return await Trade.find({ signalId })
    .sort({ createdAt: -1 })
    .limit(50) // Prevent unbounded queries - limit to 50 trades per signal
    .lean();
}

export async function getUserTradeStats(userId: string) {
  if (!Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID format");
  }

  const trades = await Trade.find({ userId })
    .limit(1000) // Prevent unbounded queries - limit to 1000 most recent trades for stats
    .lean();

  const totalTrades = trades.length;
  const openTrades = trades.filter((t) => t.status === "open" || t.status === "partial").length;
  const closedTrades = trades.filter((t) => t.status === "closed").length;
  const totalInvested = trades.reduce((sum, t) => sum + t.investedAmount, 0);
  const totalRealized = trades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0);

  return {
    totalTrades,
    openTrades,
    closedTrades,
    totalInvested,
    totalRealized,
    winRate:
      closedTrades > 0
        ? trades.filter((t) => t.status === "closed" && (t.realizedPnL || 0) > 0).length /
          closedTrades
        : 0,
  };
}

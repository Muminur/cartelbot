/**
 * Usage Limit Checker
 * Validates if user can perform actions based on subscription tier
 *
 * Admin users (emails in ADMIN_EMAILS) have unlimited access (100-year Pro subscription)
 */

import { connectDB } from "@/lib/db/connection";
import { Signal } from "@/lib/db/models/Signal";
import { Trade } from "@/lib/db/models/Trade";
import { User } from "@/lib/db/models/User";
import { TIER_CONFIGS, SubscriptionTier } from "./constants";

/**
 * Check if email belongs to an admin user
 * Admin users have unlimited access (100-year Pro subscription equivalent)
 */
function isAdminEmail(email: string): boolean {
  const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim().toLowerCase()) || [];
  return adminEmails.includes(email.toLowerCase());
}

export interface UsageStatus {
  canPerformAction: boolean;
  reason?: string;
  current: number;
  limit: number;
}

/**
 * Check if user can submit a new signal based on their tier limits
 */
export async function canSubmitSignal(userId: string): Promise<UsageStatus> {
  await connectDB();

  // Get user's subscription tier
  const user = await User.findById(userId);
  if (!user) {
    return {
      canPerformAction: false,
      reason: "User not found",
      current: 0,
      limit: 0,
    };
  }

  // Admin users have unlimited access (100-year Pro subscription equivalent)
  if (isAdminEmail(user.email)) {
    return {
      canPerformAction: true,
      current: 0,
      limit: -1, // Unlimited
    };
  }

  // Check if subscription is expired
  if (user.subscriptionExpiry && new Date() > user.subscriptionExpiry) {
    return {
      canPerformAction: false,
      reason: "Subscription expired. Please renew to continue.",
      current: 0,
      limit: 0,
    };
  }

  const tier = user.subscriptionTier as SubscriptionTier;
  const tierConfig = TIER_CONFIGS[tier];

  // Pro tier has unlimited signals
  if (tierConfig.features.signalsPerMonth === -1) {
    return {
      canPerformAction: true,
      current: 0,
      limit: -1,
    };
  }

  // Count signals submitted this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const signalsThisMonth = await Signal.countDocuments({
    userId,
    createdAt: { $gte: startOfMonth },
  });

  const limit = tierConfig.features.signalsPerMonth;
  const canSubmit = signalsThisMonth < limit;

  return {
    canPerformAction: canSubmit,
    reason: canSubmit ? undefined : `Monthly signal limit reached (${limit} signals). Upgrade to submit more.`,
    current: signalsThisMonth,
    limit,
  };
}

/**
 * Get user's current usage statistics
 */
export async function getUserUsageStats(userId: string) {
  await connectDB();

  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  // Admin users get Pro tier stats with 100-year subscription
  if (isAdminEmail(user.email)) {
    const proTierConfig = TIER_CONFIGS.pro;
    const adminExpiryDate = new Date();
    adminExpiryDate.setFullYear(adminExpiryDate.getFullYear() + 100);

    return {
      tier: {
        ...proTierConfig,
        displayName: "Admin (Pro)",
      },
      usage: {
        signalsThisMonth: 0,
        signalsLimit: -1, // Unlimited
        activePositions: 0,
        activePositionsLimit: proTierConfig.features.maxOpenPositions,
      },
      subscription: {
        isExpired: false,
        expiryDate: adminExpiryDate,
        daysRemaining: 36500, // ~100 years in days
      },
      isAdmin: true,
    };
  }

  const tier = user.subscriptionTier as SubscriptionTier;
  const tierConfig = TIER_CONFIGS[tier];

  // Count signals this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const signalsThisMonth = await Signal.countDocuments({
    userId,
    createdAt: { $gte: startOfMonth },
  });

  const activeTradesCount = await Trade.countDocuments({
    userId,
    status: "open",
  });

  const isExpired = user.subscriptionExpiry ? new Date() > user.subscriptionExpiry : false;

  return {
    tier: tierConfig,
    usage: {
      signalsThisMonth,
      signalsLimit: tierConfig.features.signalsPerMonth,
      activePositions: activeTradesCount,
      activePositionsLimit: tierConfig.features.maxOpenPositions,
    },
    subscription: {
      isExpired,
      expiryDate: user.subscriptionExpiry,
      daysRemaining: user.subscriptionExpiry
        ? Math.ceil((user.subscriptionExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null,
    },
  };
}

/**
 * Check if user's subscription is active
 */
export function isSubscriptionActive(user: { subscriptionExpiry?: Date }): boolean {
  if (!user.subscriptionExpiry) {
    return true; // Free tier never expires
  }
  return new Date() <= user.subscriptionExpiry;
}

/**
 * Calculate subscription end date based on tier and start date
 */
export function calculateSubscriptionEndDate(startDate: Date, durationMonths: number = 1): Date {
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + durationMonths);
  return endDate;
}

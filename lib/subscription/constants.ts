// NOTE: Do NOT import env config here - this file is used in client-side components
// Wallet address and confirmations should be fetched from API endpoints instead

export const SUBSCRIPTION_TIERS = {
  FREE: "free",
  PREMIUM: "premium",
  PRO: "pro",
} as const;

export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[keyof typeof SUBSCRIPTION_TIERS];

export interface TierConfig {
  name: string;
  displayName: string;
  price: number; // Monthly price in USDT
  features: {
    signalsPerMonth: number;
    maxOpenPositions: number;
    prioritySupport: boolean;
    advancedAnalytics: boolean;
    telegramNotifications: boolean;
  };
  description: string;
}

export const TIER_CONFIGS: Record<SubscriptionTier, TierConfig> = {
  free: {
    name: "free",
    displayName: "Free",
    price: 0,
    features: {
      signalsPerMonth: 1,
      maxOpenPositions: 3,
      prioritySupport: false,
      advancedAnalytics: false,
      telegramNotifications: false,
    },
    description: "Perfect for trying out CartelBot with basic features",
  },
  premium: {
    name: "premium",
    displayName: "Premium",
    price: 3,
    features: {
      signalsPerMonth: 20,
      maxOpenPositions: 10,
      prioritySupport: false,
      advancedAnalytics: false,
      telegramNotifications: true,
    },
    description: "Ideal for regular traders with moderate trading activity",
  },
  pro: {
    name: "pro",
    displayName: "Pro",
    price: 10,
    features: {
      signalsPerMonth: -1, // Unlimited
      maxOpenPositions: 200,
      prioritySupport: true,
      advancedAnalytics: true,
      telegramNotifications: true,
    },
    description: "For professional traders who need unlimited signals and advanced features",
  },
};

/**
 * Time to wait before considering a payment expired (in hours)
 */
export const PAYMENT_EXPIRY_HOURS = 24;

import { z } from "zod";

// API Keys Validation Schema
export const apiKeysSchema = z.object({
  apiKey: z
    .string()
    .min(32, "API Key must be at least 32 characters")
    .max(128, "API Key must be less than 128 characters"),
  apiSecret: z
    .string()
    .min(32, "API Secret must be at least 32 characters")
    .max(128, "API Secret must be less than 128 characters"),
});

export type ApiKeysFormData = z.infer<typeof apiKeysSchema>;

// Trading Settings Validation Schema
export const tradingSettingsSchema = z.object({
  investmentAmount: z
    .number()
    .min(10, "Investment amount must be at least 10 USDT")
    .max(100000, "Investment amount must be less than 100,000 USDT"),
  targetDistribution: z
    .array(z.number().min(0).max(100))
    .length(3, "Must have exactly 3 target distribution percentages")
    .refine(
      (arr) => arr.reduce((sum, val) => sum + val, 0) === 100,
      "Target distribution must sum to 100%"
    ),
  maxDailyLoss: z
    .number()
    .min(0, "Max daily loss cannot be negative")
    .max(10000, "Max daily loss must be less than 10,000 USDT"),
  maxOpenPositions: z
    .number()
    .int("Max open positions must be a whole number")
    .min(1, "Must allow at least 1 open position")
    .max(200, "Cannot have more than 200 open positions"),
  requireApproval: z.boolean(),
  emergencyStop: z.boolean(),
});

export type TradingSettingsFormData = z.infer<typeof tradingSettingsSchema>;

// Risk Management Validation Schema
export const riskManagementSchema = z.object({
  maxPositionSize: z
    .number()
    .min(10, "Max position size must be at least 10 USDT")
    .max(100000, "Max position size must be less than 100,000 USDT"),
  positionSizingMethod: z.enum(["fixed", "percentage", "risk_based"], {
    errorMap: () => ({ message: "Invalid position sizing method" }),
  }),
  riskPercentage: z
    .number()
    .min(0.5, "Risk percentage must be at least 0.5%")
    .max(10, "Risk percentage must be less than 10%")
    .optional(),
});

export type RiskManagementFormData = z.infer<typeof riskManagementSchema>;

// Notification Preferences Validation Schema
export const notificationSettingsSchema = z.object({
  emailNotifications: z.object({
    onTradeExecuted: z.boolean(),
    onTargetHit: z.boolean(),
    onStopLossHit: z.boolean(),
    dailySummary: z.boolean(),
  }),
  emailFrequency: z.enum(["instant", "hourly", "daily"]),
  telegramEnabled: z.boolean().default(false),
});

export type NotificationSettingsFormData = z.infer<typeof notificationSettingsSchema>;

// Combined Settings Schema (for API)
export const userSettingsSchema = z.object({
  // API Keys
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),

  // Trading Settings
  investmentAmount: z.number().min(10).max(100000).optional(),
  targetDistribution: z.array(z.number()).length(3).optional(),
  maxDailyLoss: z.number().min(0).max(10000).optional(),
  maxOpenPositions: z.number().int().min(1).max(200).optional(),
  requireApproval: z.boolean().optional(),
  emergencyStop: z.boolean().optional(),

  // Risk Management
  maxPositionSize: z.number().min(10).max(100000).optional(),
  positionSizingMethod: z.enum(["fixed", "percentage", "risk_based"]).optional(),
  riskPercentage: z.number().min(0.5).max(10).optional(),

  // Notification Settings
  emailNotifications: z
    .object({
      onTradeExecuted: z.boolean(),
      onTargetHit: z.boolean(),
      onStopLossHit: z.boolean(),
      dailySummary: z.boolean(),
    })
    .optional(),
  emailFrequency: z.enum(["instant", "hourly", "daily"]).optional(),
  telegramEnabled: z.boolean().optional(),
});

export type UserSettingsData = z.infer<typeof userSettingsSchema>;

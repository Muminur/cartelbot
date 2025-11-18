import mongoose, { Schema } from "mongoose";
import { IUser } from "@/types";

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
      validate: {
        validator: (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
        message: "Invalid email format",
      },
    },
    encryptedApiKey: {
      type: String,
      select: false,
    },
    encryptedApiSecret: {
      type: String,
      select: false,
    },
    subscriptionTier: {
      type: String,
      enum: {
        values: ["free", "premium", "pro"],
        message: "Invalid subscription tier",
      },
      default: "free",
    },
    subscriptionExpiry: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
    maxPositionSize: {
      type: Number,
      default: 10000,
      min: 10,
    },
    maxDailyLoss: {
      type: Number,
      default: 1000,
      min: 0,
    },
    maxOpenPositions: {
      type: Number,
      default: 10,
      min: 1,
      max: 200,
    },
    requireApproval: {
      type: Boolean,
      default: false,
    },
    emergencyStop: {
      type: Boolean,
      default: false,
    },
    investmentAmount: {
      type: Number,
      default: 100,
      min: 10,
    },
    targetDistribution: {
      type: [Number],
      default: [75, 15, 10],
    },
    positionSizingMethod: {
      type: String,
      enum: ["fixed", "percentage", "risk_based"],
      default: "fixed",
    },
    riskPercentage: {
      type: Number,
      default: 2,
      min: 0.5,
      max: 10,
    },
    emailNotifications: {
      type: {
        onTradeExecuted: { type: Boolean, default: true },
        onTargetHit: { type: Boolean, default: true },
        onStopLossHit: { type: Boolean, default: true },
        dailySummary: { type: Boolean, default: false },
      },
      default: {
        onTradeExecuted: true,
        onTargetHit: true,
        onStopLossHit: true,
        dailySummary: false,
      },
    },
    emailFrequency: {
      type: String,
      enum: ["instant", "hourly", "daily"],
      default: "instant",
    },
    telegramEnabled: {
      type: Boolean,
      default: false,
    },
    useTestnet: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ subscriptionTier: 1, subscriptionExpiry: 1 });
userSchema.index({ isActive: 1, subscriptionExpiry: 1 });

if (process.env.NODE_ENV === "development") {
  const models = mongoose.models as { [key: string]: any };
  if (models.User) {
    delete models.User;
  }
  const connectionModels = mongoose.connection.models as { [key: string]: any };
  if (connectionModels.User) {
    delete connectionModels.User;
  }
}

export const User = mongoose.models.User || mongoose.model<IUser>("User", userSchema);

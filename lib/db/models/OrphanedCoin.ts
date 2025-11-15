import mongoose, { Schema } from "mongoose";
import { IOrphanedCoin } from "@/types";

const orphanedCoinSchema = new Schema<IOrphanedCoin>(
  {
    userId: {
      type: String,
      required: [true, "User ID is required"],
      ref: "User",
    },
    signalId: {
      type: String,
      required: [true, "Signal ID is required"],
      ref: "Signal",
    },
    tradeId: {
      type: String,
      required: [true, "Trade ID is required"],
      ref: "Trade",
    },
    symbol: {
      type: String,
      required: [true, "Symbol is required"],
      uppercase: true,
      validate: {
        validator: (symbol: string) => /^[A-Z]{3,10}USDT$/.test(symbol),
        message: "Symbol must end with USDT",
      },
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [0, "Quantity must be positive"],
    },
    buyPrice: {
      type: Number,
      required: [true, "Buy price is required"],
      min: [0, "Buy price must be positive"],
    },
    buyOrderId: {
      type: Number,
      required: [true, "Buy order ID is required"],
    },
    buyTimestamp: {
      type: Date,
      required: [true, "Buy timestamp is required"],
    },
    currentMarketPrice: {
      type: Number,
      min: [0, "Current market price must be positive"],
    },
    status: {
      type: String,
      enum: {
        values: ["active", "sold", "expired"],
        message: "Invalid orphaned coin status",
      },
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
orphanedCoinSchema.index({ userId: 1, status: 1, createdAt: -1 });
orphanedCoinSchema.index({ symbol: 1, status: 1 });
orphanedCoinSchema.index({ tradeId: 1 });

// Unique constraint to prevent duplicate orphaned coins for same trade
orphanedCoinSchema.index({ userId: 1, tradeId: 1 }, { unique: true });

// TTL index to automatically delete sold/expired records after 90 days
// Only applies to documents with status "sold" or "expired"
orphanedCoinSchema.index(
  { updatedAt: 1 },
  {
    expireAfterSeconds: 7776000, // 90 days = 90 * 24 * 60 * 60
    partialFilterExpression: { status: { $in: ["sold", "expired"] } },
  }
);

// CRITICAL FIX: In development, delete cached model to force recompilation when schema changes
// This prevents validation errors when enum values are updated during development
if (process.env.NODE_ENV === "development" && mongoose.models.OrphanedCoin) {
  delete mongoose.models.OrphanedCoin;
  delete mongoose.connection.models.OrphanedCoin;
}

export const OrphanedCoin =
  mongoose.models.OrphanedCoin ||
  mongoose.model<IOrphanedCoin>("OrphanedCoin", orphanedCoinSchema);

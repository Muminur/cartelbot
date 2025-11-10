import mongoose, { Schema } from "mongoose";
import { ISignal } from "@/types";

const signalSchema = new Schema<ISignal>(
  {
    userId: {
      type: String,
      required: [true, "User ID is required"],
      ref: "User",
    },
    symbol: {
      type: String,
      required: [true, "Symbol is required"],
      uppercase: true,
      trim: true,
      validate: {
        validator: (symbol: string) => /^[A-Z]{3,10}USDT$/.test(symbol),
        message: "Symbol must end with USDT and be 3-10 characters",
      },
    },
    entries: {
      type: [Number],
      required: [true, "Entry prices are required"],
      validate: {
        validator: (entries: number[]) => entries.length > 0 && entries.every((e) => e > 0),
        message: "Entries must be positive numbers and non-empty",
      },
    },
    targets: {
      type: [Number],
      required: [true, "Target prices are required"],
      validate: {
        validator: (targets: number[]) => targets.length > 0 && targets.every((t) => t > 0),
        message: "Targets must be positive numbers and non-empty",
      },
    },
    stopLoss: {
      type: Number,
      required: [true, "Stop loss is required"],
      min: [0, "Stop loss must be positive"],
    },
    currentMarketPrice: {
      type: Number,
      min: [0, "Current market price must be positive"],
    },
    status: {
      type: String,
      enum: {
        values: ["pending", "parsed", "executing", "completed", "failed", "cancelled"],
        message: "Invalid signal status",
      },
      default: "pending",
    },
    rawSignal: {
      type: String,
      required: [true, "Raw signal text is required"],
    },
    isImageSignal: {
      type: Boolean,
      default: false,
    },
    imageUrl: {
      type: String,
      validate: {
        validator: (url: string) => !url || /^https?:\/\/.+/.test(url),
        message: "Image URL must be a valid HTTP/HTTPS URL",
      },
    },
    parseErrors: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

signalSchema.index({ userId: 1, createdAt: -1 });
signalSchema.index({ status: 1, createdAt: -1 });
signalSchema.index({ symbol: 1, createdAt: -1 });
signalSchema.index({ userId: 1, status: 1 });

export const Signal = mongoose.models.Signal || mongoose.model<ISignal>("Signal", signalSchema);

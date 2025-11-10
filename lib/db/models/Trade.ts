import mongoose, { Schema } from "mongoose";
import { ITrade, IOrder } from "@/types";

const orderSchema = new Schema<IOrder>(
  {
    orderId: {
      type: Number,
      required: true,
    },
    symbol: {
      type: String,
      required: true,
    },
    side: {
      type: String,
      enum: ["BUY", "SELL"],
      required: true,
    },
    type: {
      type: String,
      enum: ["MARKET", "LIMIT", "OCO"],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    price: {
      type: Number,
    },
    stopPrice: {
      type: Number,
    },
    executedQty: {
      type: Number,
      required: true,
    },
    cummulativeQuoteQty: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      required: true,
    },
  },
  { _id: false }
);

const tradeSchema = new Schema<ITrade>(
  {
    userId: {
      type: String,
      required: [true, "User ID is required"],
      ref: "User",
      index: true,
    },
    signalId: {
      type: String,
      required: [true, "Signal ID is required"],
      ref: "Signal",
      index: true,
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
    buyOrder: {
      type: orderSchema,
      required: [true, "Buy order is required"],
    },
    sellOrders: {
      type: [orderSchema],
      default: [],
    },
    entryPrice: {
      type: Number,
      required: [true, "Entry price is required"],
      min: [0, "Entry price must be positive"],
    },
    exitPrice: {
      type: Number,
      min: [0, "Exit price must be positive"],
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [0, "Quantity must be positive"],
    },
    investedAmount: {
      type: Number,
      required: [true, "Invested amount is required"],
      min: [0, "Invested amount must be positive"],
    },
    realizedPnL: {
      type: Number,
    },
    unrealizedPnL: {
      type: Number,
    },
    status: {
      type: String,
      enum: {
        values: ["open", "partial", "closed", "cancelled"],
        message: "Invalid trade status",
      },
      default: "open",
      index: true,
    },
    closeReason: {
      type: String,
      enum: {
        values: ["target", "stop_loss", "manual", "cancelled"],
        message: "Invalid close reason",
      },
    },
  },
  {
    timestamps: true,
  }
);

tradeSchema.index({ userId: 1, createdAt: -1 });
tradeSchema.index({ status: 1, createdAt: -1 });
tradeSchema.index({ symbol: 1, createdAt: -1 });
tradeSchema.index({ userId: 1, status: 1 });
tradeSchema.index({ signalId: 1 });

export const Trade = mongoose.models.Trade || mongoose.model<ITrade>("Trade", tradeSchema);

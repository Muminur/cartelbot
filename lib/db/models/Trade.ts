import mongoose, { Schema } from "mongoose";
import { ITrade, IOrder } from "@/types";

const orderSchema = new Schema<IOrder>(
  {
    orderId: {
      type: Number,
      required: true,
    },
    orderListId: {
      type: Number,
      // Optional - only for OCO orders. Used to cancel entire OCO group.
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
      enum: ["MARKET", "LIMIT", "OCO", "LIMIT_MAKER", "STOP_LOSS_LIMIT"],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    price: {
      type: Number,
      min: 0,
    },
    stopPrice: {
      type: Number,
      min: 0,
    },
    executedQty: {
      type: Number,
      required: true,
      min: 0,
    },
    cummulativeQuoteQty: {
      type: Number,
      required: true,
      min: 0,
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
    },
    signalId: {
      type: String,
      required: [true, "Signal ID is required"],
      ref: "Signal",
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
        values: ["pending_approval", "open", "partial", "closed", "cancelled"],
        message: "Invalid trade status",
      },
      default: "open",
    },
    closeReason: {
      type: String,
      enum: {
        values: ["target", "stop_loss", "manual", "cancelled"],
        message: "Invalid close reason",
      },
    },
    approvalStatus: {
      type: String,
      enum: {
        values: ["pending", "approved", "rejected", "not_required"],
        message: "Invalid approval status",
      },
      default: "not_required",
    },
    approvedAt: {
      type: Date,
    },
    approvedBy: {
      type: String,
    },
    targets: {
      type: [Number],
      default: [],
    },
    stopLoss: {
      type: Number,
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

// CRITICAL FIX: In development, delete cached model to force recompilation when schema changes
// This prevents validation errors when enum values are updated during development
if (process.env.NODE_ENV === "development" && mongoose.models.Trade) {
  delete mongoose.models.Trade;
  delete mongoose.connection.models.Trade;
}

export const Trade = mongoose.models.Trade || mongoose.model<ITrade>("Trade", tradeSchema);

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
    fills: {
      type: [{
        price: { type: String, required: true },
        qty: { type: String, required: true },
        commission: { type: String, required: true },
        commissionAsset: { type: String, required: true },
      }],
    },
    targetIndex: {
      type: Number,
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
        validator: (symbol: string) => /^[A-Z]{2,10}USDT$/.test(symbol),
        message: "Symbol must be 2-10 characters and end with USDT",
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
    closeReasonDetail: {
      type: String,
      maxlength: [200, "Close reason detail cannot exceed 200 characters"],
      // Human-readable close reason (e.g., "Targets 1, 2, 3 Hit", "Stop Loss Hit", "Manual Close")
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
    targetAdjustmentReason: {
      type: String,
      maxlength: [500, "Target adjustment reason cannot exceed 500 characters"],
      // Records why targets were adjusted (e.g., market moved above original targets)
    },
    targetAdjustmentNotificationSent: {
      type: Boolean,
      default: false,
      // Flag to track if user has been notified about target adjustments
    },
    preBuyBalance: {
      type: Number,
      min: [0, "Pre-buy balance must be non-negative"],
      // Balance of base asset BEFORE the buy order - used for settlement verification
      // Helps detect if settlement already completed during proactive delay
    },
    testnet: {
      type: Boolean,
      default: false,
    },
    lastError: {
      message: { type: String },
      code: { type: String },
      timestamp: { type: Date },
    },
    tradeErrors: [{
      message: { type: String, required: true },
      code: String,
      timestamp: { type: Date, default: Date.now },
      operation: String,
    }],
    failedTargets: [{
      index: { type: Number, required: true },
      price: { type: Number, required: true },
      reason: { type: String, required: true },
      code: String,
      timestamp: { type: Date, default: Date.now },
    }],
    ocoCreationSummary: {
      createdCount: { type: Number, min: 0 },
      failedCount: { type: Number, min: 0 },
      totalTargets: { type: Number, min: 0 },
      allocatedQuantity: { type: Number, min: 0 },
      unallocatedQuantity: { type: Number, min: 0 },
      allocationPercentage: { type: Number, min: 0, max: 100 },
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
// Index for OCO orders queries (critical for /api/oco performance)
tradeSchema.index({ userId: 1, "sellOrders.0": 1 });
tradeSchema.index({ userId: 1, "sellOrders.orderListId": 1 }); // CRITICAL: For efficient OCO queries
// PERF: Compound index for /api/oco complex query (userId + status + sellOrders exists)
tradeSchema.index({ userId: 1, status: 1, "sellOrders.0": 1, "sellOrders.orderListId": 1, createdAt: -1 });
// Index for phantom order cleanup query (critical for safe cleanup performance)
tradeSchema.index({ userId: 1, symbol: 1, status: 1 });

if (process.env.NODE_ENV === "development") {
  const models = mongoose.models as { [key: string]: any };
  if (models.Trade) {
    delete models.Trade;
  }
  const connectionModels = mongoose.connection.models as { [key: string]: any };
  if (connectionModels.Trade) {
    delete connectionModels.Trade;
  }
}

export const Trade = mongoose.models.Trade || mongoose.model<ITrade>("Trade", tradeSchema);

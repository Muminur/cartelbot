import mongoose, { Schema } from "mongoose";
import { ISubscription } from "@/types";

const subscriptionSchema = new Schema<ISubscription>(
  {
    userId: {
      type: String,
      required: [true, "User ID is required"],
      ref: "User",
    },
    tier: {
      type: String,
      enum: {
        values: ["free", "premium", "pro"],
        message: "Invalid subscription tier",
      },
      required: [true, "Subscription tier is required"],
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0, "Amount must be positive"],
    },
    currency: {
      type: String,
      enum: {
        values: ["USDT"],
        message: "Only USDT is supported",
      },
      default: "USDT",
    },
    txHash: {
      type: String,
      validate: {
        validator: (hash: string) => !hash || /^[0-9a-fA-F]{64}$/.test(hash),
        message: "Invalid TRC20 transaction hash (must be 64 hex characters without 0x prefix)",
      },
    },
    fromAddress: {
      type: String,
      validate: {
        validator: (addr: string) => !addr || /^T[a-zA-Z0-9]{33}$/.test(addr),
        message: "Invalid TRC20 address format",
      },
    },
    status: {
      type: String,
      enum: {
        values: ["pending", "confirmed", "expired", "cancelled"],
        message: "Invalid subscription status",
      },
      default: "pending",
    },
    startDate: {
      type: Date,
      required: [true, "Start date is required"],
    },
    endDate: {
      type: Date,
      required: [true, "End date is required"],
      validate: {
        validator: function (this: ISubscription, endDate: Date) {
          return endDate > this.startDate;
        },
        message: "End date must be after start date",
      },
    },
    autoRenew: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

subscriptionSchema.index({ userId: 1, status: 1 });
subscriptionSchema.index({ endDate: 1, status: 1 });
subscriptionSchema.index({ txHash: 1 }, { sparse: true });
subscriptionSchema.index({ userId: 1, endDate: -1 });

if (process.env.NODE_ENV === "development") {
  const models = mongoose.models as { [key: string]: any };
  if (models.Subscription) {
    delete models.Subscription;
  }
  const connectionModels = mongoose.connection.models as { [key: string]: any };
  if (connectionModels.Subscription) {
    delete connectionModels.Subscription;
  }
}

export const Subscription =
  mongoose.models.Subscription || mongoose.model<ISubscription>("Subscription", subscriptionSchema);

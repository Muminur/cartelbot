import mongoose, { Schema } from "mongoose";
import { IUser } from "@/types";

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
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
      index: true,
    },
    subscriptionExpiry: {
      type: Date,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastLogin: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ subscriptionTier: 1, subscriptionExpiry: 1 });
userSchema.index({ isActive: 1, subscriptionExpiry: 1 });

export const User = mongoose.models.User || mongoose.model<IUser>("User", userSchema);

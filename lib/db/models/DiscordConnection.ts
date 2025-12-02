import mongoose, { Schema } from "mongoose";
import { IDiscordConnection } from "@/types";

const discordConnectionSchema = new Schema<IDiscordConnection>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: [true, "User ID is required"],
      ref: "User",
      index: true,
    },
    discordUserToken: {
      type: String,
      required: [true, "Discord user token is required"],
      select: false, // Encrypted token - never select by default
    },
    discordUserId: {
      type: String,
      required: [true, "Discord user ID is required"],
    },
    discordUsername: {
      type: String,
      required: [true, "Discord username is required"],
    },
    serverId: {
      type: String,
      required: [true, "Server ID is required"],
      index: true,
    },
    serverName: {
      type: String,
      required: [true, "Server name is required"],
    },
    channelId: {
      type: String,
      required: [true, "Channel ID is required"],
      index: true,
    },
    channelName: {
      type: String,
      required: [true, "Channel name is required"],
    },
    status: {
      type: String,
      enum: {
        values: ["active", "paused", "error", "banned", "expired"],
        message: "Invalid connection status",
      },
      default: "active",
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastMessageId: {
      type: String,
      default: "",
    },
    lastProcessedAt: {
      type: Date,
      index: true,
    },
    autoExecute: {
      type: Boolean,
      default: true,
    },
    requireConfirmation: {
      type: Boolean,
      default: false,
    },
    errorCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastError: {
      type: String,
    },
    lastErrorAt: {
      type: Date,
    },
    tosAccepted: {
      type: Boolean,
      required: [true, "Terms of Service acceptance is required"],
      default: false,
      validate: {
        validator: (value: boolean) => value === true,
        message: "Terms of Service must be accepted",
      },
    },
    tosAcceptedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
discordConnectionSchema.index({ userId: 1, isActive: 1 });
discordConnectionSchema.index({ serverId: 1, channelId: 1 });
discordConnectionSchema.index({ status: 1, lastProcessedAt: 1 });
discordConnectionSchema.index({ discordUserId: 1 });

// Prevent duplicate connections for same user+server+channel
discordConnectionSchema.index(
  { userId: 1, serverId: 1, channelId: 1 },
  { unique: true }
);

// Development environment - clear cached models
if (process.env.NODE_ENV === "development") {
  const models = mongoose.models as { [key: string]: any };
  if (models.DiscordConnection) {
    delete models.DiscordConnection;
  }
  const connectionModels = mongoose.connection.models as { [key: string]: any };
  if (connectionModels.DiscordConnection) {
    delete connectionModels.DiscordConnection;
  }
}

export const DiscordConnection =
  mongoose.models.DiscordConnection ||
  mongoose.model<IDiscordConnection>("DiscordConnection", discordConnectionSchema);

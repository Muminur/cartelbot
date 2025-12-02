import mongoose, { Schema } from "mongoose";
import { IDiscordMessage } from "@/types";

const discordMessageSchema = new Schema<IDiscordMessage>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: [true, "User ID is required"],
      ref: "User",
      index: true,
    },
    connectionId: {
      type: Schema.Types.ObjectId,
      required: [true, "Connection ID is required"],
      ref: "DiscordConnection",
      index: true,
    },
    discordMessageId: {
      type: String,
      required: [true, "Discord message ID is required"],
    },
    serverId: {
      type: String,
      required: [true, "Server ID is required"],
      index: true,
    },
    channelId: {
      type: String,
      required: [true, "Channel ID is required"],
      index: true,
    },
    authorId: {
      type: String,
      required: [true, "Author ID is required"],
    },
    authorUsername: {
      type: String,
      required: [true, "Author username is required"],
    },
    content: {
      type: String,
      required: [true, "Message content is required"],
    },
    timestamp: {
      type: Date,
      required: [true, "Message timestamp is required"],
      index: true,
    },
    processingStatus: {
      type: String,
      enum: {
        values: ["pending", "parsed", "executed", "failed", "ignored"],
        message: "Invalid processing status",
      },
      default: "pending",
      index: true,
    },
    parsedSignal: {
      type: {
        symbol: { type: String, required: true },
        entries: { type: [Number], required: true },
        targets: { type: [Number], required: true },
        stopLoss: { type: Number, required: true },
        confidence: { type: Number, required: true },
      },
      required: false,
    },
    signalId: {
      type: Schema.Types.ObjectId,
      ref: "Signal",
      index: true,
    },
    tradeId: {
      type: Schema.Types.ObjectId,
      ref: "Trade",
      index: true,
    },
    parseErrors: {
      type: [String],
      default: [],
    },
    executionError: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
discordMessageSchema.index({ userId: 1, processingStatus: 1, createdAt: -1 });
discordMessageSchema.index({ discordMessageId: 1, channelId: 1 }, { unique: true });
discordMessageSchema.index({ connectionId: 1, timestamp: -1 });

// Development environment - clear cached models
if (process.env.NODE_ENV === "development") {
  const models = mongoose.models as { [key: string]: any };
  if (models.DiscordMessage) {
    delete models.DiscordMessage;
  }
  const connectionModels = mongoose.connection.models as { [key: string]: any };
  if (connectionModels.DiscordMessage) {
    delete connectionModels.DiscordMessage;
  }
}

export const DiscordMessage =
  mongoose.models.DiscordMessage ||
  mongoose.model<IDiscordMessage>("DiscordMessage", discordMessageSchema);

import mongoose, { Schema } from "mongoose";
import { IWebSocketSession } from "@/types";

const webSocketSessionSchema = new Schema<IWebSocketSession>(
  {
    userId: {
      type: String,
      required: [true, "User ID is required"],
      ref: "User",
      index: true,
    },
    listenKey: {
      type: String,
      required: [true, "Listen key is required"],
      unique: true,
      validate: {
        validator: (key: string) => key.length > 0,
        message: "Listen key cannot be empty",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastKeepAlive: {
      type: Date,
      required: [true, "Last keep alive timestamp is required"],
      default: Date.now,
      index: true,
    },
    connectionState: {
      type: String,
      enum: {
        values: ["connecting", "connected", "disconnected", "error"],
        message: "Invalid connection state",
      },
      default: "connecting",
      index: true,
    },
    errorMessage: {
      type: String,
      maxlength: [500, "Error message too long"],
    },
  },
  {
    timestamps: true,
  }
);

webSocketSessionSchema.index({ userId: 1, isActive: 1 });
webSocketSessionSchema.index({ listenKey: 1 }, { unique: true });
webSocketSessionSchema.index({ lastKeepAlive: 1 });
webSocketSessionSchema.index({ userId: 1, connectionState: 1 });

export const WebSocketSession =
  mongoose.models.WebSocketSession ||
  mongoose.model<IWebSocketSession>("WebSocketSession", webSocketSessionSchema);

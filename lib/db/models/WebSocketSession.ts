import mongoose, { Schema } from "mongoose";
import { IWebSocketSession } from "@/types";

const webSocketSessionSchema = new Schema<IWebSocketSession>(
  {
    userId: {
      type: String,
      required: [true, "User ID is required"],
      ref: "User",
    },
    listenKey: {
      type: String,
      required: [true, "Listen key is required"],
      validate: {
        validator: (key: string) => key.length > 0,
        message: "Listen key cannot be empty",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastKeepAlive: {
      type: Date,
      required: [true, "Last keep alive timestamp is required"],
      default: Date.now,
    },
    connectionState: {
      type: String,
      enum: {
        values: ["connecting", "connected", "disconnected", "error"],
        message: "Invalid connection state",
      },
      default: "connecting",
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

if (process.env.NODE_ENV === "development") {
  const models = mongoose.models as { [key: string]: any };
  if (models.WebSocketSession) {
    delete models.WebSocketSession;
  }
  const connectionModels = mongoose.connection.models as { [key: string]: any };
  if (connectionModels.WebSocketSession) {
    delete connectionModels.WebSocketSession;
  }
}

export const WebSocketSession =
  mongoose.models.WebSocketSession ||
  mongoose.model<IWebSocketSession>("WebSocketSession", webSocketSessionSchema);

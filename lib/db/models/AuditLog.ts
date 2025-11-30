import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAuditLog extends Document {
  userId?: mongoose.Types.ObjectId;
  action: string;
  resource: string;
  resourceId?: string;
  method: string;
  endpoint: string;
  ip: string;
  userAgent: string;
  statusCode: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        "auth.login",
        "auth.logout",
        "auth.magic_link",
        "user.api_key.create",
        "user.api_key.update",
        "user.api_key.delete",
        "user.settings.update",
        "signal.create",
        "signal.delete",
        "signal.cancel",
        "trade.execute",
        "trade.approve",
        "trade.close",
        "trade.delete",
        "subscription.create",
        "subscription.approve",
        "subscription.reject",
        "admin.user.view",
        "admin.user.suspend",
        "admin.signal.view",
        "admin.system.health",
        "admin.login.success",
        "admin.login.failed",
        "admin.logout",
        "admin.password.changed",
        "admin.password.change.failed",
      ],
      index: true,
    },
    resource: {
      type: String,
      required: true,
      enum: ["auth", "user", "signal", "trade", "subscription", "admin"],
      index: true,
    },
    resourceId: {
      type: String,
      index: true,
    },
    method: {
      type: String,
      required: true,
      enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    },
    endpoint: {
      type: String,
      required: true,
    },
    ip: {
      type: String,
      required: true,
      index: true,
    },
    userAgent: {
      type: String,
      required: true,
    },
    statusCode: {
      type: Number,
      required: true,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ userId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ resource: 1, createdAt: -1 });

let AuditLog: Model<IAuditLog>;

try {
  AuditLog = mongoose.model<IAuditLog>("AuditLog");
} catch {
  AuditLog = mongoose.model<IAuditLog>("AuditLog", AuditLogSchema);
}

export default AuditLog;

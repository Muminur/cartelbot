import AuditLog, { IAuditLog } from "@/lib/db/models/AuditLog";
import { connectDB } from "@/lib/db/connection";

interface AuditLogInput {
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  method: string;
  endpoint: string;
  ip: string;
  userAgent: string;
  statusCode: number;
  metadata?: Record<string, unknown>;
}

export async function createAuditLog(data: AuditLogInput): Promise<void> {
  try {
    await connectDB();

    await AuditLog.create({
      userId: data.userId,
      action: data.action,
      resource: data.resource,
      resourceId: data.resourceId,
      method: data.method,
      endpoint: data.endpoint,
      ip: data.ip,
      userAgent: data.userAgent,
      statusCode: data.statusCode,
      metadata: data.metadata,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Failed to create audit log:", error);
    }
  }
}

export function getIpFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  if (realIp) {
    return realIp;
  }

  return "unknown";
}

export function getUserAgentFromRequest(request: Request): string {
  return request.headers.get("user-agent") || "unknown";
}

export async function logAuthAction(
  request: Request,
  action: "auth.login" | "auth.logout" | "auth.magic_link",
  userId: string | undefined,
  statusCode: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  await createAuditLog({
    userId,
    action,
    resource: "auth",
    method: request.method,
    endpoint: new URL(request.url).pathname,
    ip: getIpFromRequest(request),
    userAgent: getUserAgentFromRequest(request),
    statusCode,
    metadata,
  });
}

export async function logUserAction(
  request: Request,
  action: "user.api_key.create" | "user.api_key.update" | "user.api_key.delete" | "user.settings.update",
  userId: string,
  statusCode: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  await createAuditLog({
    userId,
    action,
    resource: "user",
    method: request.method,
    endpoint: new URL(request.url).pathname,
    ip: getIpFromRequest(request),
    userAgent: getUserAgentFromRequest(request),
    statusCode,
    metadata,
  });
}

export async function logSignalAction(
  request: Request,
  action: "signal.create" | "signal.delete" | "signal.cancel",
  userId: string,
  signalId: string,
  statusCode: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  await createAuditLog({
    userId,
    action,
    resource: "signal",
    resourceId: signalId,
    method: request.method,
    endpoint: new URL(request.url).pathname,
    ip: getIpFromRequest(request),
    userAgent: getUserAgentFromRequest(request),
    statusCode,
    metadata,
  });
}

export async function logTradeAction(
  request: Request,
  action: "trade.execute" | "trade.approve" | "trade.close" | "trade.delete",
  userId: string,
  tradeId: string,
  statusCode: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  await createAuditLog({
    userId,
    action,
    resource: "trade",
    resourceId: tradeId,
    method: request.method,
    endpoint: new URL(request.url).pathname,
    ip: getIpFromRequest(request),
    userAgent: getUserAgentFromRequest(request),
    statusCode,
    metadata,
  });
}

export async function logAdminAction(
  request: Request,
  action: "admin.user.view" | "admin.user.suspend" | "admin.signal.view" | "admin.system.health",
  userId: string,
  statusCode: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  await createAuditLog({
    userId,
    action,
    resource: "admin",
    method: request.method,
    endpoint: new URL(request.url).pathname,
    ip: getIpFromRequest(request),
    userAgent: getUserAgentFromRequest(request),
    statusCode,
    metadata,
  });
}

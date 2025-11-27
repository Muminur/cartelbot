import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";

function getWhitelistedIps(): string[] {
  const whitelist = env.ADMIN_IP_WHITELIST || "";
  if (!whitelist) return [];

  return whitelist
    .split(",")
    .map((ip) => ip.trim())
    .filter((ip) => ip.length > 0);
}

function getClientIp(request: Request): string {
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

export async function requireWhitelistedIp(request: Request): Promise<NextResponse | null> {
  const whitelistedIps = getWhitelistedIps();

  if (whitelistedIps.length === 0) {
    return null;
  }

  const clientIp = getClientIp(request);

  if (!whitelistedIps.includes(clientIp)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "IP_NOT_WHITELISTED",
          message: "Access denied from this IP address",
          statusCode: 403,
        },
      },
      { status: 403 }
    );
  }

  return null;
}

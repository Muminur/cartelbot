import { NextRequest, NextResponse } from "next/server";
import { createAuditLog, getIpFromRequest, getUserAgentFromRequest } from "@/lib/audit/logger";
import { verifyJWT } from "@/lib/auth/jwt";

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("admin_token")?.value;

    if (token) {
      const payload = verifyJWT(token);

      if (payload && payload.username) {
        // Log logout
        await createAuditLog({
          userId: undefined,
          action: "admin.logout",
          resource: "admin",
          resourceId: undefined,
          method: request.method,
          endpoint: new URL(request.url).pathname,
          ip: getIpFromRequest(request),
          userAgent: getUserAgentFromRequest(request),
          statusCode: 200,
          metadata: {
            username: payload.username,
          },
        });
      }
    }

    const response = NextResponse.json({
      success: true,
      data: { message: "Logged out successfully" },
    });

    // Clear the admin token cookie
    response.cookies.delete("admin_token");

    return response;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Admin logout error:", error);
    }

    const response = NextResponse.json({
      success: true,
      data: { message: "Logged out" },
    });

    response.cookies.delete("admin_token");

    return response;
  }
}

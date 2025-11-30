import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { signJWT } from "@/lib/auth/jwt";
import { createAuditLog, getIpFromRequest, getUserAgentFromRequest } from "@/lib/audit/logger";
import { rateLimit } from "@/lib/middleware/rate-limiter";
import { sanitizeAlphanumeric } from "@/lib/security/sanitizer";

// Admin credentials (hashed passwords stored in environment variables)
// Runtime validation happens on first request
function getAdminCredentials() {
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;

  if (!passwordHash) {
    throw new Error("ADMIN_PASSWORD_HASH environment variable is required");
  }

  return {
    username: process.env.ADMIN_USERNAME || "admin",
    passwordHash,
  };
}

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting (5 attempts per 15 minutes)
    const ip = getIpFromRequest(request);
    const rateLimitResponse = await rateLimit(ip, "auth");
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const body = await request.json();
    const { username, password } = body;

    // Input validation
    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: "Username and password are required" },
        { status: 400 }
      );
    }

    // Get admin credentials (validates env vars)
    const adminCredentials = getAdminCredentials();

    // Sanitize inputs
    const sanitizedUsername = sanitizeAlphanumeric(username);

    // Verify credentials
    const isUsernameValid = sanitizedUsername === adminCredentials.username;
    const isPasswordValid = await bcrypt.compare(password, adminCredentials.passwordHash);

    if (!isUsernameValid || !isPasswordValid) {
      // Log failed login attempt
      await createAuditLog({
        userId: undefined,
        action: "admin.login.failed",
        resource: "admin",
        resourceId: undefined,
        method: request.method,
        endpoint: new URL(request.url).pathname,
        ip: getIpFromRequest(request),
        userAgent: getUserAgentFromRequest(request),
        statusCode: 401,
        metadata: {
          username: sanitizedUsername,
        },
      });

      return NextResponse.json(
        { success: false, error: "Invalid username or password" },
        { status: 401 }
      );
    }

    // Generate JWT token for admin session (7 days)
    const token = signJWT(
      {
        role: "admin",
        username: adminCredentials.username,
        isAdmin: true,
      },
      "7d"
    );

    // Log successful login
    await createAuditLog({
      userId: undefined,
      action: "admin.login.success",
      resource: "admin",
      resourceId: undefined,
      method: request.method,
      endpoint: new URL(request.url).pathname,
      ip: getIpFromRequest(request),
      userAgent: getUserAgentFromRequest(request),
      statusCode: 200,
      metadata: {
        username: adminCredentials.username,
      },
    });

    // Set HTTP-only cookie
    const response = NextResponse.json({
      success: true,
      data: {
        message: "Admin login successful",
        user: {
          username: adminCredentials.username,
          role: "admin",
        },
      },
    });

    response.cookies.set("admin_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return response;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Admin login error:", error);
    }

    return NextResponse.json(
      { success: false, error: "An error occurred during login" },
      { status: 500 }
    );
  }
}

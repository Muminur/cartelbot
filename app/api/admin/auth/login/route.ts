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

  // Validate hash length - bcrypt hashes are 60 characters
  // Common issue on Windows: Git Bash expands $ as shell variables, corrupting the hash
  // Example: $2b$10$... becomes .Y9xl... (32 chars instead of 60)
  // Fix: Wrap hash in single quotes in .env.local: ADMIN_PASSWORD_HASH='$2b$10$...'
  const expectedHashLength = 60;
  if (passwordHash.length !== expectedHashLength) {
    const errorMsg = `ADMIN_PASSWORD_HASH is corrupted (${passwordHash.length} chars, expected ${expectedHashLength}).
Common cause on Windows: Git Bash interpreting $ as shell variables.
Fix: Edit .env.local using Windows Notepad (not Bash) and wrap the hash in single quotes:
ADMIN_PASSWORD_HASH='$2b$10$...'`;

    if (process.env.NODE_ENV === "development") {
      console.error("[Admin Auth Error]", errorMsg);
      console.error("[Current Hash Value]", passwordHash);
    }

    throw new Error(errorMsg);
  }

  return {
    username: process.env.ADMIN_USERNAME || "admin",
    passwordHash,
  };
}

// Cookie name constant
const ADMIN_TOKEN_COOKIE = "admin_token";

// Maximum password length (bcrypt max is 72)
const MAX_PASSWORD_LENGTH = 72;

// Request body interface
interface AdminLoginRequest {
  username: string;
  password: string;
}

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting (5 attempts per 15 minutes)
    const ip = getIpFromRequest(request);
    const rateLimitResponse = await rateLimit(ip, "auth");
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Safe JSON parsing with validation
    let body: AdminLoginRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    const { username, password } = body;

    // Input validation
    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: "Username and password are required" },
        { status: 400 }
      );
    }

    // Password length validation (bcrypt max is 72 characters)
    if (typeof password !== "string" || password.length > MAX_PASSWORD_LENGTH) {
      return NextResponse.json(
        { success: false, error: "Invalid password format" },
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

    // Development logging for debugging (no sensitive data exposed)
    if (process.env.NODE_ENV === "development") {
      console.log("[Admin Login Debug]", {
        inputUsername: sanitizedUsername,
        expectedUsername: adminCredentials.username,
        usernameMatch: isUsernameValid,
        passwordMatch: isPasswordValid,
        hashConfigured: !!adminCredentials.passwordHash,
      });
    }

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

    response.cookies.set(ADMIN_TOKEN_COOKIE, token, {
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

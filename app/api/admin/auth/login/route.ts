import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { signJWT } from "@/lib/auth/jwt";
import { createAuditLog, getIpFromRequest, getUserAgentFromRequest } from "@/lib/audit/logger";
import { rateLimit } from "@/lib/middleware/rate-limiter";
import { sanitizeAlphanumeric } from "@/lib/security/sanitizer";
import { connectDB, Admin } from "@/lib/db";

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

    // Sanitize inputs
    const sanitizedUsername = sanitizeAlphanumeric(username);

    // Connect to database
    await connectDB();

    // Find admin by username (include passwordHash field)
    const admin = await Admin.findOne({
      username: sanitizedUsername,
    }).select("+passwordHash");

    // Check if admin exists
    if (!admin) {
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
          reason: "Admin not found",
        },
      });

      return NextResponse.json(
        { success: false, error: "Invalid username or password" },
        { status: 401 }
      );
    }

    // Check if account is locked
    if (admin.lockUntil && admin.lockUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (admin.lockUntil.getTime() - Date.now()) / (1000 * 60)
      );

      await createAuditLog({
        userId: undefined,
        action: "admin.login.failed",
        resource: "admin",
        resourceId: admin._id.toString(),
        method: request.method,
        endpoint: new URL(request.url).pathname,
        ip: getIpFromRequest(request),
        userAgent: getUserAgentFromRequest(request),
        statusCode: 423,
        metadata: {
          username: sanitizedUsername,
          reason: "Account locked",
          minutesLeft,
        },
      });

      return NextResponse.json(
        {
          success: false,
          error: `Account is locked. Try again in ${minutesLeft} minute(s)`,
        },
        { status: 423 }
      );
    }

    // Check if account is active
    if (!admin.isActive) {
      await createAuditLog({
        userId: undefined,
        action: "admin.login.failed",
        resource: "admin",
        resourceId: admin._id.toString(),
        method: request.method,
        endpoint: new URL(request.url).pathname,
        ip: getIpFromRequest(request),
        userAgent: getUserAgentFromRequest(request),
        statusCode: 403,
        metadata: {
          username: sanitizedUsername,
          reason: "Account inactive",
        },
      });

      return NextResponse.json(
        { success: false, error: "Account is inactive" },
        { status: 403 }
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, admin.passwordHash);

    if (!isPasswordValid) {
      // Increment login attempts
      await admin.incLoginAttempts();

      // Log failed login attempt
      await createAuditLog({
        userId: undefined,
        action: "admin.login.failed",
        resource: "admin",
        resourceId: admin._id.toString(),
        method: request.method,
        endpoint: new URL(request.url).pathname,
        ip: getIpFromRequest(request),
        userAgent: getUserAgentFromRequest(request),
        statusCode: 401,
        metadata: {
          username: sanitizedUsername,
          reason: "Invalid password",
          loginAttempts: admin.loginAttempts + 1,
        },
      });

      return NextResponse.json(
        { success: false, error: "Invalid username or password" },
        { status: 401 }
      );
    }

    // Reset login attempts on successful login
    await admin.resetLoginAttempts();

    // Generate JWT token for admin session (7 days)
    const token = signJWT(
      {
        role: "admin",
        username: admin.username,
        isAdmin: true,
        adminId: admin._id.toString(),
      },
      "7d"
    );

    // Log successful login
    await createAuditLog({
      userId: undefined,
      action: "admin.login.success",
      resource: "admin",
      resourceId: admin._id.toString(),
      method: request.method,
      endpoint: new URL(request.url).pathname,
      ip: getIpFromRequest(request),
      userAgent: getUserAgentFromRequest(request),
      statusCode: 200,
      metadata: {
        username: admin.username,
      },
    });

    // Set HTTP-only cookie
    const response = NextResponse.json({
      success: true,
      data: {
        message: "Admin login successful",
        user: {
          username: admin.username,
          email: admin.email,
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

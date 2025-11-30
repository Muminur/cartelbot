import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { verifyJWT } from "@/lib/auth/jwt";
import { createAuditLog, getIpFromRequest, getUserAgentFromRequest } from "@/lib/audit/logger";
import { connectDB, Admin } from "@/lib/db";

const BCRYPT_ROUNDS = 10;

interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export async function POST(request: NextRequest) {
  try {
    // Verify admin authentication
    const token = request.cookies.get("admin_token")?.value;

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Verify JWT token
    const decoded = verifyJWT(token);
    if (!decoded || !decoded.isAdmin) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse request body
    let body: ChangePasswordRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword, confirmPassword } = body;

    // Input validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { success: false, error: "All fields are required" },
        { status: 400 }
      );
    }

    // Validate new password
    if (newPassword.length < 8) {
      return NextResponse.json(
        { success: false, error: "New password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Check if passwords match
    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { success: false, error: "New passwords do not match" },
        { status: 400 }
      );
    }

    // Check if new password is different from current
    if (currentPassword === newPassword) {
      return NextResponse.json(
        { success: false, error: "New password must be different from current password" },
        { status: 400 }
      );
    }

    // Connect to database
    await connectDB();

    // Find admin by username (from JWT)
    const admin = await Admin.findOne({
      username: decoded.username,
    }).select("+passwordHash");

    if (!admin) {
      return NextResponse.json(
        { success: false, error: "Admin not found" },
        { status: 404 }
      );
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      admin.passwordHash
    );

    if (!isCurrentPasswordValid) {
      // Log failed password change attempt
      await createAuditLog({
        userId: undefined,
        action: "admin.password.change.failed",
        resource: "admin",
        resourceId: admin._id.toString(),
        method: request.method,
        endpoint: new URL(request.url).pathname,
        ip: getIpFromRequest(request),
        userAgent: getUserAgentFromRequest(request),
        statusCode: 401,
        metadata: {
          username: admin.username,
          reason: "Invalid current password",
        },
      });

      return NextResponse.json(
        { success: false, error: "Current password is incorrect" },
        { status: 401 }
      );
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    // Update password
    admin.passwordHash = newPasswordHash;
    await admin.save();

    // Log successful password change
    await createAuditLog({
      userId: undefined,
      action: "admin.password.changed",
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

    return NextResponse.json({
      success: true,
      data: {
        message: "Password changed successfully",
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Change password error:", error);
    }

    return NextResponse.json(
      { success: false, error: "An error occurred while changing password" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { formatErrorResponse } from "@/lib/utils/errors";
import { pythonServiceClient } from "@/lib/discord/python-service-client";

/**
 * POST /api/discord/token/validate
 * Validates a Discord user token by testing it with the Python service
 * TODO: Add rate limiting (5 requests per 15 minutes per user)
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const user = await requireAuth();

    // Parse request body
    const body = await request.json();
    const { token } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Discord token is required",
            code: "VALIDATION_ERROR",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    // Basic token format validation (Discord tokens are typically 59-88 chars)
    if (token.length < 50 || token.length > 150) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Invalid token format",
            code: "VALIDATION_ERROR",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[Discord Token Validate] Validating token for user:", user._id);
    }

    // Call Python service to validate token
    const result = await pythonServiceClient.validateToken(token);

    if (!result.success || !result.data?.valid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: result.error || "Invalid Discord token",
            code: "INVALID_TOKEN",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    // Token is valid
    return NextResponse.json({
      success: true,
      data: {
        valid: true,
        userId: result.data.userId,
        username: result.data.username,
      },
    });
  } catch (error) {
    console.error("POST /api/discord/token/validate error:", error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}

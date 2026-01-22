import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { formatErrorResponse } from "@/lib/utils/errors";
import { validateDiscordToken } from "@/lib/discord/token-validator";
import { rateLimit } from "@/lib/middleware/rate-limiter";

/**
 * POST /api/discord/token/validate
 * Validates a Discord user token by testing it with the Discord API
 * Rate limit: 5 requests per 15 minutes per user (auth tier)
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const user = await requireAuth();

    // Apply rate limiting (5 requests per 15 minutes using 'auth' tier)
    const rateLimitResponse = await rateLimit(String(user._id), "auth");
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

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

    // Validate token using TLS-fingerprinted Discord API call
    const result = await validateDiscordToken(token);

    if (result.valid) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[Discord Token Validate] Validation successful:", {
          userId: result.userId,
          username: result.username,
        });
      }

      // Token is valid - return at root level for TokenInput compatibility
      return NextResponse.json({
        success: true,
        valid: true,
        userId: result.userId,
        username: result.username,
        discriminator: result.discriminator || "0",
      });
    }

    // Token validation failed
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
  } catch (error) {
    console.error("POST /api/discord/token/validate error:", error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}

// Force dynamic rendering for authenticated route
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

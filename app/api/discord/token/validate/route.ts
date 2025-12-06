import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { formatErrorResponse } from "@/lib/utils/errors";
import { pythonServiceClient } from "@/lib/discord/python-service-client";
import { rateLimit } from "@/lib/middleware/rate-limiter";
import axios from "axios";

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
}

/**
 * POST /api/discord/token/validate
 * Validates a Discord user token by testing it with the Python service
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

    // Try Python service first
    const result = await pythonServiceClient.validateToken(token);

    if (result.success && result.data?.valid) {
      // Python service succeeded
      return NextResponse.json({
        success: true,
        valid: true,
        userId: result.data.userId,
        username: result.data.username,
        discriminator: result.data.discriminator || "0",
      });
    }

    // Python service failed - fallback to direct Discord API validation
    if (process.env.NODE_ENV !== "production") {
      console.log("[Discord Token Validate] Python service failed, using Discord API fallback");
    }

    try {
      const discordResponse = await axios.get<DiscordUser>(
        "https://discord.com/api/v10/users/@me",
        {
          headers: {
            Authorization: token,
          },
          timeout: 10000,
        }
      );

      const discordUser = discordResponse.data;

      if (process.env.NODE_ENV !== "production") {
        console.log("[Discord Token Validate] Direct API validation successful:", {
          userId: discordUser.id,
          username: discordUser.username,
        });
      }

      // Token is valid - return at root level for TokenInput compatibility
      return NextResponse.json({
        success: true,
        valid: true,
        userId: discordUser.id,
        username: discordUser.username,
        discriminator: discordUser.discriminator || "0",
      });
    } catch (discordError: unknown) {
      if (axios.isAxiosError(discordError)) {
        const status = discordError.response?.status;

        if (status === 401) {
          return NextResponse.json(
            {
              success: false,
              error: {
                message: "Invalid Discord token",
                code: "INVALID_TOKEN",
                statusCode: 400,
              },
            },
            { status: 400 }
          );
        }

        if (process.env.NODE_ENV !== "production") {
          console.error("[Discord Token Validate] Discord API error:", {
            status,
            message: discordError.message,
          });
        }
      }

      // Return the original Python service error or a generic one
      return NextResponse.json(
        {
          success: false,
          error: {
            message: result.error || "Failed to validate Discord token",
            code: "INVALID_TOKEN",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }
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

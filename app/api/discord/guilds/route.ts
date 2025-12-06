import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { formatErrorResponse } from "@/lib/utils/errors";
import { connectDB } from "@/lib/db";
import { DiscordConnection } from "@/lib/db/models";
import { decrypt } from "@/lib/encryption";
import { rateLimit } from "@/lib/middleware/rate-limiter";
import axios from "axios";

// Token validation constants
const DISCORD_TOKEN_MIN_LENGTH = 50;
const DISCORD_TOKEN_MAX_LENGTH = 150;

interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner?: boolean;
}

/**
 * GET /api/discord/guilds
 * Fetch user's Discord servers (guilds) from Discord API
 * Uses token from user's existing Discord connections
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    await connectDB();

    // Get user's active Discord connections
    const connections = await DiscordConnection.find({
      userId: user._id,
      isActive: true,
    })
      .select("+discordUserToken")
      .lean();

    if (connections.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        message: "No active Discord connections found",
      });
    }

    // Use the first active connection's token
    const token = decrypt(connections[0].discordUserToken);

    try {
      // Fetch guilds from Discord API
      const response = await axios.get<DiscordGuild[]>(
        "https://discord.com/api/v10/users/@me/guilds",
        {
          headers: {
            Authorization: token,
          },
          timeout: 10000,
        }
      );

      // Format guild data - consistent with POST endpoint
      const guilds = response.data.map((guild) => ({
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        owner: guild.owner || false,
      }));

      if (process.env.NODE_ENV !== "production") {
        console.log("[Discord Guilds] Fetched guilds:", {
          userId: user._id,
          count: guilds.length,
        });
      }

      return NextResponse.json({
        success: true,
        guilds,
      });
    } catch (discordError: unknown) {
      if (axios.isAxiosError(discordError)) {
        const status = discordError.response?.status;
        const errorMessage = discordError.response?.data?.message || discordError.message;

        if (status === 401) {
          // Token is invalid - update connection status
          await DiscordConnection.updateMany(
            { userId: user._id },
            {
              status: "expired",
              lastError: "Discord token expired or invalid",
              lastErrorAt: new Date(),
            }
          );

          return NextResponse.json(
            {
              success: false,
              error: {
                message: "Discord token expired. Please reconnect your Discord account.",
                code: "TOKEN_EXPIRED",
                statusCode: 401,
              },
            },
            { status: 401 }
          );
        }

        console.error("[Discord Guilds] Discord API error:", {
          status,
          message: errorMessage,
        });

        return NextResponse.json(
          {
            success: false,
            error: {
              message: errorMessage || "Failed to fetch Discord servers",
              code: "DISCORD_API_ERROR",
              statusCode: status || 500,
            },
          },
          { status: status || 500 }
        );
      }

      throw discordError;
    }
  } catch (error) {
    console.error("GET /api/discord/guilds error:", error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}

/**
 * POST /api/discord/guilds
 * Fetch Discord servers using a provided token (for first-time setup)
 * Token is passed in request body, not from existing connections
 * Rate limit: 5 requests per 15 minutes per user (auth tier)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

    // Apply rate limiting (5 requests per 15 minutes using 'auth' tier)
    const rateLimitResponse = await rateLimit(String(user._id), "auth");
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const body = await request.json();
    const { token } = body;

    // Validate token presence and type
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

    // Validate token length (Discord tokens are typically 59-88 chars)
    if (token.length < DISCORD_TOKEN_MIN_LENGTH || token.length > DISCORD_TOKEN_MAX_LENGTH) {
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

    try {
      // Fetch guilds from Discord API using provided token
      const response = await axios.get<DiscordGuild[]>(
        "https://discord.com/api/v10/users/@me/guilds",
        {
          headers: {
            Authorization: token,
          },
          timeout: 10000,
        }
      );

      // Format guild data to match client expectations
      const guilds = response.data.map((guild) => ({
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        owner: guild.owner || false,
      }));

      if (process.env.NODE_ENV !== "production") {
        console.log("[Discord Guilds] Fetched guilds via POST:", {
          count: guilds.length,
        });
      }

      return NextResponse.json({
        success: true,
        guilds,
      });
    } catch (discordError: unknown) {
      if (axios.isAxiosError(discordError)) {
        const status = discordError.response?.status;
        const errorMessage =
          discordError.response?.data?.message || discordError.message;

        if (status === 401) {
          return NextResponse.json(
            {
              success: false,
              error: {
                message: "Invalid Discord token. Please check and try again.",
                code: "INVALID_TOKEN",
                statusCode: 401,
              },
            },
            { status: 401 }
          );
        }

        if (process.env.NODE_ENV !== "production") {
          console.error("[Discord Guilds] Discord API error:", {
            status,
            message: errorMessage,
          });
        }

        return NextResponse.json(
          {
            success: false,
            error: {
              message: errorMessage || "Failed to fetch Discord servers",
              code: "DISCORD_API_ERROR",
              statusCode: status || 500,
            },
          },
          { status: status || 500 }
        );
      }

      throw discordError;
    }
  } catch (error: unknown) {
    if (process.env.NODE_ENV !== "production") {
      console.error("POST /api/discord/guilds error:", error);
    }
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

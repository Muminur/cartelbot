import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { formatErrorResponse } from "@/lib/utils/errors";
import { decrypt } from "@/lib/encryption";
import { rateLimit } from "@/lib/middleware/rate-limiter";
import axios from "axios";

// Constants for token validation
const DISCORD_TOKEN_MIN_LENGTH = 50;
const DISCORD_TOKEN_MAX_LENGTH = 150;

interface DiscordAPIChannel {
  id: string;
  name: string;
  type: number;
  position?: number;
  parent_id?: string;
}

/**
 * Helper to format channel response consistently
 */
function formatChannelResponse(channels: DiscordAPIChannel[]) {
  return channels
    .filter((channel) => channel.type === 0) // GUILD_TEXT only
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      position: channel.position || 0,
      parentId: channel.parent_id,
    }));
}

/**
 * GET /api/discord/channels/[guildId]
 * Fetch channels in a Discord server
 * Query param: token (encrypted, from frontend)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  try {
    const user = await requireAuth();

    // Rate limiting
    const rateLimitResponse = await rateLimit(String(user._id), "auth");
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { guildId } = await params;

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const encryptedToken = searchParams.get("token");

    if (!encryptedToken) {
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

    if (!guildId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Guild ID is required",
            code: "VALIDATION_ERROR",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    // Decrypt token
    let token: string;
    try {
      token = decrypt(encryptedToken);
    } catch (decryptError) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[Discord Channels] Token decryption failed:", decryptError);
      }
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Invalid token format",
            code: "DECRYPTION_ERROR",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    try {
      // Fetch channels from Discord API
      const response = await axios.get<DiscordAPIChannel[]>(
        `https://discord.com/api/v10/guilds/${guildId}/channels`,
        {
          headers: {
            Authorization: token,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          },
          timeout: 10000,
        }
      );

      const textChannels = formatChannelResponse(response.data);

      if (process.env.NODE_ENV !== "production") {
        console.log("[Discord Channels] GET - Fetched channels:", {
          userId: user._id,
          guildId,
          count: textChannels.length,
        });
      }

      return NextResponse.json({
        success: true,
        channels: textChannels,
      });
    } catch (discordError: unknown) {
      if (axios.isAxiosError(discordError)) {
        const status = discordError.response?.status;
        const errorMessage = discordError.response?.data?.message || discordError.message;

        if (status === 401) {
          return NextResponse.json(
            {
              success: false,
              error: {
                message: "Discord token expired or invalid",
                code: "TOKEN_EXPIRED",
                statusCode: 401,
              },
            },
            { status: 401 }
          );
        }

        if (status === 403) {
          return NextResponse.json(
            {
              success: false,
              error: {
                message: "No access to this server",
                code: "FORBIDDEN",
                statusCode: 403,
              },
            },
            { status: 403 }
          );
        }

        if (process.env.NODE_ENV !== "production") {
          console.error("[Discord Channels] Discord API error:", {
            status,
            message: errorMessage,
          });
        }

        return NextResponse.json(
          {
            success: false,
            error: {
              message: errorMessage || "Failed to fetch Discord channels",
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
    console.error("GET /api/discord/channels/[guildId] error:", error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}

/**
 * POST /api/discord/channels/[guildId]
 * Fetch channels in a Discord server (token in body)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  try {
    const user = await requireAuth();

    // Rate limiting
    const rateLimitResponse = await rateLimit(String(user._id), "auth");
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { guildId } = await params;

    // Parse request body
    let body: { token?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Invalid JSON body",
            code: "VALIDATION_ERROR",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    const { token } = body;

    // Type validation
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

    // Validate token length
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

    if (!guildId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Guild ID is required",
            code: "VALIDATION_ERROR",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    try {
      // Fetch channels from Discord API
      const response = await axios.get<DiscordAPIChannel[]>(
        `https://discord.com/api/v10/guilds/${guildId}/channels`,
        {
          headers: {
            Authorization: token,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          },
          timeout: 10000,
        }
      );

      const textChannels = formatChannelResponse(response.data);

      if (process.env.NODE_ENV !== "production") {
        console.log("[Discord Channels] POST - Fetched channels:", {
          userId: user._id,
          guildId,
          count: textChannels.length,
        });
      }

      return NextResponse.json({
        success: true,
        channels: textChannels,
      });
    } catch (discordError: unknown) {
      if (axios.isAxiosError(discordError)) {
        const status = discordError.response?.status;
        const errorMessage = discordError.response?.data?.message || discordError.message;

        if (status === 401) {
          return NextResponse.json(
            {
              success: false,
              error: {
                message: "Discord token expired or invalid",
                code: "TOKEN_EXPIRED",
                statusCode: 401,
              },
            },
            { status: 401 }
          );
        }

        if (status === 403) {
          return NextResponse.json(
            {
              success: false,
              error: {
                message: "No access to this server",
                code: "FORBIDDEN",
                statusCode: 403,
              },
            },
            { status: 403 }
          );
        }

        if (process.env.NODE_ENV !== "production") {
          console.error("[Discord Channels] Discord API error:", {
            status,
            message: errorMessage,
          });
        }

        return NextResponse.json(
          {
            success: false,
            error: {
              message: errorMessage || "Failed to fetch Discord channels",
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
    console.error("POST /api/discord/channels/[guildId] error:", error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}

// Next.js route configuration
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

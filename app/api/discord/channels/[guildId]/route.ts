import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { formatErrorResponse } from "@/lib/utils/errors";
import { decrypt } from "@/lib/encryption";
import axios from "axios";

interface DiscordChannel {
  id: string;
  name: string;
  type: number;
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
      console.error("[Discord Channels] Token decryption failed:", decryptError);
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
      const response = await axios.get<DiscordChannel[]>(
        `https://discord.com/api/v10/guilds/${guildId}/channels`,
        {
          headers: {
            Authorization: token,
          },
          timeout: 10000,
        }
      );

      // Filter to text channels only (type 0 = GUILD_TEXT)
      const textChannels = response.data
        .filter((channel) => channel.type === 0)
        .map((channel) => ({
          channelId: channel.id,
          name: channel.name,
          type: "text",
        }));

      if (process.env.NODE_ENV !== "production") {
        console.log("[Discord Channels] Fetched channels:", {
          userId: user._id,
          guildId,
          count: textChannels.length,
        });
      }

      return NextResponse.json({
        success: true,
        data: textChannels,
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

        console.error("[Discord Channels] Discord API error:", {
          status,
          message: errorMessage,
        });

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

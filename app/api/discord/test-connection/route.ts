import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { formatErrorResponse } from "@/lib/utils/errors";
import { pythonServiceClient } from "@/lib/discord/python-service-client";
import axios from "axios";

/**
 * POST /api/discord/test-connection
 * Test Discord token and channel access
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

    const body = await request.json();
    const { token, serverId, channelId } = body;

    // Validate required fields
    if (!token || !serverId || !channelId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Missing required fields",
            code: "VALIDATION_ERROR",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[Discord Test Connection] Testing connection:", {
        userId: user._id,
        serverId,
        channelId,
      });
    }

    // Step 1: Validate token with Python service
    const tokenValidation = await pythonServiceClient.validateToken(token);
    if (!tokenValidation.success || !tokenValidation.data?.valid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: tokenValidation.error || "Invalid Discord token",
            code: "INVALID_TOKEN",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    // Step 2: Test channel accessibility
    try {
      const channelResponse = await axios.get(
        `https://discord.com/api/v10/channels/${channelId}`,
        {
          headers: {
            Authorization: token,
          },
          timeout: 10000,
        }
      );

      const channelData = channelResponse.data;
      const channelName = channelData.name;

      // Verify channel belongs to the specified server
      if (channelData.guild_id !== serverId) {
        return NextResponse.json(
          {
            success: false,
            error: {
              message: "Channel does not belong to the specified server",
              code: "CHANNEL_MISMATCH",
              statusCode: 400,
            },
          },
          { status: 400 }
        );
      }

      // Verify it's a text channel (type 0 = GUILD_TEXT)
      if (channelData.type !== 0) {
        return NextResponse.json(
          {
            success: false,
            error: {
              message: "Only text channels are supported",
              code: "INVALID_CHANNEL_TYPE",
              statusCode: 400,
            },
          },
          { status: 400 }
        );
      }

      if (process.env.NODE_ENV !== "production") {
        console.log("[Discord Test Connection] Connection test successful:", {
          userId: user._id,
          channelName,
        });
      }

      return NextResponse.json({
        success: true,
        data: {
          message: "Connection test successful",
          channelName,
          userId: tokenValidation.data.userId,
          username: tokenValidation.data.username,
        },
      });
    } catch (discordError: any) {
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
                message: "No access to this channel",
                code: "FORBIDDEN",
                statusCode: 403,
              },
            },
            { status: 403 }
          );
        }

        if (status === 404) {
          return NextResponse.json(
            {
              success: false,
              error: {
                message: "Channel not found",
                code: "NOT_FOUND",
                statusCode: 404,
              },
            },
            { status: 404 }
          );
        }

        console.error("[Discord Test Connection] Discord API error:", {
          status,
          message: errorMessage,
        });

        return NextResponse.json(
          {
            success: false,
            error: {
              message: errorMessage || "Failed to access Discord channel",
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
    console.error("POST /api/discord/test-connection error:", error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { formatErrorResponse } from "@/lib/utils/errors";
import { connectDB } from "@/lib/db";
import { DiscordConnection, User } from "@/lib/db/models";
import { encrypt } from "@/lib/encryption";
import { pythonServiceClient } from "@/lib/discord/python-service-client";
import { serializeResponse } from "@/lib/utils/serialize";

/**
 * GET /api/discord/connections
 * List user's Discord connections
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    await connectDB();

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    // Build query
    interface DiscordConnectionQuery {
      userId: unknown;
      status?: string;
    }
    const query: DiscordConnectionQuery = { userId: user._id };
    if (status) {
      query.status = status;
    }

    // Fetch connections (excluding encrypted token by default)
    const connections = await DiscordConnection.find(query)
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      connections: serializeResponse(connections),
    });
  } catch (error) {
    console.error("GET /api/discord/connections error:", error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}

/**
 * POST /api/discord/connections
 * Create a new Discord connection
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    await connectDB();

    const body = await request.json();
    const {
      token,
      serverId,
      serverName,
      channelId,
      channelName,
      autoExecute = true,
      requireConfirmation = false,
      tosAccepted,
    } = body;

    // Validate required fields
    if (!token || !serverId || !serverName || !channelId || !channelName) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[Discord Connections] Missing fields:", {
          hasToken: !!token,
          hasServerId: !!serverId,
          hasServerName: !!serverName,
          hasChannelId: !!channelId,
          hasChannelName: !!channelName,
        });
      }
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

    // Validate TOS acceptance (mandatory)
    if (tosAccepted !== true) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[Discord Connections] TOS not accepted:", { tosAccepted });
      }
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "You must accept the Terms of Service",
            code: "TOS_NOT_ACCEPTED",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    // Check max connections limit
    const maxConnections =
      parseInt(process.env.DISCORD_MAX_CONNECTIONS_PER_USER || "3", 10);
    const existingCount = await DiscordConnection.countDocuments({
      userId: user._id,
      isActive: true,
    });

    if (existingCount >= maxConnections) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: `Maximum ${maxConnections} active connections allowed`,
            code: "MAX_CONNECTIONS_EXCEEDED",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    // Validate token with Python service
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

    const { userId: discordUserId, username: discordUsername } =
      tokenValidation.data;

    // Check for duplicate connection
    const existingConnection = await DiscordConnection.findOne({
      userId: user._id,
      serverId,
      channelId,
    });

    if (existingConnection) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Connection already exists for this server and channel",
            code: "DUPLICATE_CONNECTION",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    // Encrypt token before storing
    const encryptedToken = encrypt(token);

    // Create connection document
    const connection = await DiscordConnection.create({
      userId: user._id,
      discordUserToken: encryptedToken,
      discordUserId: discordUserId!,
      discordUsername: discordUsername!,
      serverId,
      serverName,
      channelId,
      channelName,
      status: "active",
      isActive: true,
      lastMessageId: "",
      autoExecute,
      requireConfirmation,
      errorCount: 0,
      tosAccepted: true,
      tosAcceptedAt: new Date(),
    });

    // Start Python Discord client
    const startResult = await pythonServiceClient.startClient({
      userId: String(user._id),
      connectionId: String(connection._id),
      token,
      serverId,
      channelId,
    });

    if (!startResult.success) {
      // Client start failed - update connection status
      await DiscordConnection.updateOne(
        { _id: connection._id },
        {
          status: "error",
          lastError: startResult.error || "Failed to start Discord client",
          lastErrorAt: new Date(),
          errorCount: 1,
        }
      );

      return NextResponse.json(
        {
          success: false,
          error: {
            message: startResult.error || "Failed to start Discord client",
            code: "CLIENT_START_FAILED",
            statusCode: 500,
          },
        },
        { status: 500 }
      );
    }

    // Update user's Discord connection status
    await User.updateOne(
      { _id: user._id },
      {
        discordUserId,
        discordUsername,
        discordConnected: true,
      }
    );

    if (process.env.NODE_ENV !== "production") {
      console.log("[Discord] Connection created successfully:", {
        connectionId: connection._id,
        userId: user._id,
        serverId,
        channelId,
      });
    }

    // Return connection without encrypted token
    const connectionData = connection.toObject();
    delete (connectionData as any).discordUserToken;

    return NextResponse.json(
      {
        success: true,
        data: serializeResponse({
          connectionId: connection._id,
          ...connectionData,
        }),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/discord/connections error:", error);
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

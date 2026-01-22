import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { formatErrorResponse } from "@/lib/utils/errors";
import { connectDB } from "@/lib/db";
import { DiscordConnection, User } from "@/lib/db/models";
import { encrypt } from "@/lib/encryption";
import { getDiscordClientManager } from "@/lib/discord/client-manager";
import { validateDiscordToken } from "@/lib/discord/token-validator";
import { serializeResponse } from "@/lib/utils/serialize";
import mongoose from "mongoose";

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

    // Debug: Log all received fields
    if (process.env.NODE_ENV !== "production") {
      console.log("[Discord Connections] Full request body:", {
        hasToken: !!token,
        hasServerId: !!serverId,
        hasServerName: !!serverName,
        hasChannelId: !!channelId,
        hasChannelName: !!channelName,
        hasTosAccepted: tosAccepted !== undefined,
        tosAcceptedValue: tosAccepted,
        tosAcceptedType: typeof tosAccepted,
        tosAcceptedStrictCheck: tosAccepted === true,
      });
    }

    // Validate required fields
    if (!token || !serverId || !serverName || !channelId || !channelName) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[Discord Connections] ❌ RETURNING 400 - Missing fields:", {
          hasToken: !!token,
          hasServerId: !!serverId,
          hasServerName: !!serverName,
          hasChannelId: !!channelId,
          hasChannelName: !!channelName,
        });
      }
      const errorResponse = {
        success: false,
        error: {
          message: "Missing required fields",
          code: "VALIDATION_ERROR",
          statusCode: 400,
        },
      };
      if (process.env.NODE_ENV !== "production") {
        console.log("[Discord Connections] Response being sent:", errorResponse);
      }
      return NextResponse.json(errorResponse, { status: 400 });
    }

    // Validate TOS acceptance (mandatory)
    if (tosAccepted !== true) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[Discord Connections] ❌ RETURNING 400 - TOS validation failed:", {
          tosAccepted,
          tosAcceptedType: typeof tosAccepted,
          strictCheck: tosAccepted === true,
        });
      }
      const errorResponse = {
        success: false,
        error: {
          message: "You must accept the Terms of Service",
          code: "TOS_NOT_ACCEPTED",
          statusCode: 400,
        },
      };
      if (process.env.NODE_ENV !== "production") {
        console.log("[Discord Connections] Response being sent:", errorResponse);
      }
      return NextResponse.json(errorResponse, { status: 400 });
    }

    // Extract Discord user info from request body (already validated via /api/discord/token/validate)
    let { discordUserId, discordUsername } = body;

    if (process.env.NODE_ENV !== "production") {
      console.log("[Discord Connections] Step 1 - Extracted from body:", {
        hasToken: !!token,
        hasDiscordUserId: !!discordUserId,
        hasDiscordUsername: !!discordUsername,
        discordUserId,
        discordUsername,
      });
    }

    // Validate that Discord user info was provided
    if (!discordUserId || !discordUsername) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[Discord Connections] Step 2 - Discord user info missing, validating token...");
      }

      const tokenValidation = await validateDiscordToken(token);

      if (!tokenValidation.valid) {
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

      discordUserId = tokenValidation.userId || "";
      discordUsername = tokenValidation.username || "";
    }

    if (!discordUserId || !discordUsername) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Discord user information is required",
            code: "VALIDATION_ERROR",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    // Use MongoDB transaction to prevent race conditions
    // This ensures atomic check-and-create for max connections and duplicates
    const session = await mongoose.startSession();

    // Store connection data for use after transaction
    interface ConnectionResult {
      _id: mongoose.Types.ObjectId;
      userId: mongoose.Types.ObjectId;
      discordUserId: string;
      discordUsername: string;
      serverId: string;
      serverName: string;
      channelId: string;
      channelName: string;
      status: string;
      isActive: boolean;
      autoExecute: boolean;
      requireConfirmation: boolean;
      errorCount: number;
      tosAccepted: boolean;
      tosAcceptedAt: Date;
    }
    let connectionResult: ConnectionResult | null = null;

    try {
      await session.withTransaction(async () => {
        // Check max connections limit (atomic within transaction)
        const maxConnections = parseInt(process.env.DISCORD_MAX_CONNECTIONS_PER_USER || "3", 10);
        const existingCount = await DiscordConnection.countDocuments({
          userId: user._id,
          isActive: true,
        }).session(session);

        if (existingCount >= maxConnections) {
          throw new Error(`MAX_CONNECTIONS:Maximum ${maxConnections} active connections allowed`);
        }

        // Check for duplicate connection (atomic within transaction)
        const existingConnection = await DiscordConnection.findOne({
          userId: user._id,
          serverId,
          channelId,
        }).session(session);

        if (existingConnection) {
          throw new Error("DUPLICATE:Connection already exists for this server and channel");
        }

        // Encrypt token and create connection (atomic within transaction)
        const encryptedToken = encrypt(token);
        const [newConnection] = await DiscordConnection.create(
          [
            {
              userId: user._id,
              discordUserToken: encryptedToken,
              discordUserId,
              discordUsername,
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
            },
          ],
          { session }
        );

        connectionResult = {
          _id: newConnection._id as mongoose.Types.ObjectId,
          userId: newConnection.userId as mongoose.Types.ObjectId,
          discordUserId: newConnection.discordUserId,
          discordUsername: newConnection.discordUsername,
          serverId: newConnection.serverId,
          serverName: newConnection.serverName,
          channelId: newConnection.channelId,
          channelName: newConnection.channelName,
          status: newConnection.status,
          isActive: newConnection.isActive,
          autoExecute: newConnection.autoExecute,
          requireConfirmation: newConnection.requireConfirmation,
          errorCount: newConnection.errorCount,
          tosAccepted: newConnection.tosAccepted,
          tosAcceptedAt: newConnection.tosAcceptedAt,
        };
      });
    } catch (txError) {
      // Handle specific transaction errors (return early)
      if (txError instanceof Error) {
        if (txError.message.startsWith("MAX_CONNECTIONS:")) {
          return NextResponse.json(
            {
              success: false,
              error: {
                message: txError.message.replace("MAX_CONNECTIONS:", ""),
                code: "MAX_CONNECTIONS_EXCEEDED",
                statusCode: 400,
              },
            },
            { status: 400 }
          );
        }
        if (txError.message.startsWith("DUPLICATE:")) {
          return NextResponse.json(
            {
              success: false,
              error: {
                message: txError.message.replace("DUPLICATE:", ""),
                code: "DUPLICATE_CONNECTION",
                statusCode: 400,
              },
            },
            { status: 400 }
          );
        }
      }
      throw txError;
    } finally {
      // Ensure session is always closed regardless of success/failure
      await session.endSession();
    }

    if (!connectionResult) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Failed to create connection",
            code: "CREATE_FAILED",
            statusCode: 500,
          },
        },
        { status: 500 }
      );
    }

    // TypeScript can't narrow types assigned in async callbacks, use explicit variable
    const connection: ConnectionResult = connectionResult;

    // Start JavaScript Discord client
    const manager = getDiscordClientManager();
    const startResult = await manager.startClient(
      String(user._id),
      String(connection._id),
      token,
      serverId,
      channelId
    );

    if (!startResult.success) {
      // Client start failed - update connection status
      try {
        await DiscordConnection.updateOne(
          { _id: connection._id },
          {
            status: "error",
            lastError: startResult.error || "Failed to start Discord client",
            lastErrorAt: new Date(),
            errorCount: 1,
          }
        );
      } catch (updateError) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[Discord] Failed to update connection error status:", updateError);
        }
      }

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

    // Return connection data without encrypted token
    return NextResponse.json(
      {
        success: true,
        data: serializeResponse({
          connectionId: connection._id,
          ...connection,
        }),
      },
      { status: 201 }
    );
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("POST /api/discord/connections - CATCH BLOCK ERROR:", {
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      });
    }
    const errorResponse = formatErrorResponse(error);

    if (process.env.NODE_ENV !== "production") {
      console.error("POST /api/discord/connections - ERROR RESPONSE:", errorResponse);
    }

    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}

// Force dynamic rendering for authenticated route
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

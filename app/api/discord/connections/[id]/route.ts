import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { formatErrorResponse, NotFoundError } from "@/lib/utils/errors";
import { connectDB } from "@/lib/db";
import { DiscordConnection, User } from "@/lib/db/models";
import { decrypt } from "@/lib/encryption";
import { pythonServiceClient } from "@/lib/discord/python-service-client";
import { serializeResponse } from "@/lib/utils/serialize";
import { Types } from "mongoose";

/**
 * PUT /api/discord/connections/[id]
 * Update a Discord connection's settings
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    await connectDB();

    const { id } = await params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Invalid connection ID",
            code: "VALIDATION_ERROR",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    // Find connection and verify ownership
    const connection = await DiscordConnection.findOne({
      _id: id,
      userId: user._id,
    }).select("+discordUserToken");

    if (!connection) {
      throw new NotFoundError("Connection");
    }

    const body = await request.json();
    const { isActive, autoExecute, requireConfirmation } = body;

    // Track if we need to start/stop the Python client
    let needsClientUpdate = false;
    let shouldStartClient = false;

    // Update allowed fields
    if (typeof isActive === "boolean" && isActive !== connection.isActive) {
      connection.isActive = isActive;
      needsClientUpdate = true;
      shouldStartClient = isActive;
    }

    if (typeof autoExecute === "boolean") {
      connection.autoExecute = autoExecute;
    }

    if (typeof requireConfirmation === "boolean") {
      connection.requireConfirmation = requireConfirmation;
    }

    await connection.save();

    // Handle Python client start/stop if isActive changed
    if (needsClientUpdate) {
      if (shouldStartClient) {
        // Start client
        const token = decrypt(connection.discordUserToken);
        const startResult = await pythonServiceClient.startClient({
          userId: String(user._id),
          token,
          serverId: connection.serverId,
          channelId: connection.channelId,
        });

        if (!startResult.success) {
          // Update connection with error
          connection.status = "error";
          connection.lastError =
            startResult.error || "Failed to start Discord client";
          connection.lastErrorAt = new Date();
          connection.errorCount += 1;
          await connection.save();

          if (process.env.NODE_ENV !== "production") {
            console.error("[Discord] Failed to start client:", {
              connectionId: connection._id,
              error: startResult.error,
            });
          }
        } else {
          connection.status = "active";
          await connection.save();

          if (process.env.NODE_ENV !== "production") {
            console.log("[Discord] Client started successfully:", {
              connectionId: connection._id,
            });
          }
        }
      } else {
        // Stop client
        const stopResult = await pythonServiceClient.stopClient(
          String(user._id)
        );

        if (!stopResult.success) {
          if (process.env.NODE_ENV !== "production") {
            console.error("[Discord] Failed to stop client:", {
              connectionId: connection._id,
              error: stopResult.error,
            });
          }
        } else {
          connection.status = "paused";
          await connection.save();

          if (process.env.NODE_ENV !== "production") {
            console.log("[Discord] Client stopped successfully:", {
              connectionId: connection._id,
            });
          }
        }
      }
    }

    // Return connection without encrypted token
    const connectionData = connection.toObject();
    delete (connectionData as any).discordUserToken;

    return NextResponse.json({
      success: true,
      data: serializeResponse(connectionData),
    });
  } catch (error) {
    console.error("PUT /api/discord/connections/[id] error:", error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}

/**
 * DELETE /api/discord/connections/[id]
 * Remove a Discord connection
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    await connectDB();

    const { id } = await params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Invalid connection ID",
            code: "VALIDATION_ERROR",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    // Find connection and verify ownership
    const connection = await DiscordConnection.findOne({
      _id: id,
      userId: user._id,
    });

    if (!connection) {
      throw new NotFoundError("Connection");
    }

    // Stop Python client if active
    if (connection.isActive) {
      const stopResult = await pythonServiceClient.stopClient(
        String(user._id)
      );

      if (!stopResult.success) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[Discord] Failed to stop client before deletion:", {
            connectionId: connection._id,
            error: stopResult.error,
          });
        }
      }
    }

    // Delete the connection
    await DiscordConnection.deleteOne({ _id: id });

    // Check if user has any remaining active connections
    const remainingConnections = await DiscordConnection.countDocuments({
      userId: user._id,
      isActive: true,
    });

    // Update user's Discord connection status if no active connections remain
    if (remainingConnections === 0) {
      await User.updateOne(
        { _id: user._id },
        {
          discordConnected: false,
        }
      );
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[Discord] Connection deleted successfully:", {
        connectionId: id,
        userId: user._id,
        remainingConnections,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        message: "Connection deleted successfully",
      },
    });
  } catch (error) {
    console.error("DELETE /api/discord/connections/[id] error:", error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}

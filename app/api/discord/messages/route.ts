import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { formatErrorResponse } from "@/lib/utils/errors";
import { connectDB } from "@/lib/db";
import { DiscordMessage, DiscordConnection } from "@/lib/db/models";
import { serializeResponse } from "@/lib/utils/serialize";
import { Types } from "mongoose";

// Constants
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// Valid processing statuses from DiscordMessage schema
const VALID_STATUSES = ["pending", "parsed", "executed", "failed", "ignored"];

/**
 * GET /api/discord/messages
 * List user's Discord messages with optional filtering
 *
 * Query Parameters:
 * - limit: number (default 20, max 100) - Number of messages to return
 * - status: string - Filter by processing status (pending, parsed, executed, failed, ignored)
 * - connectionId: string - Filter by specific connection ID
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    await connectDB();

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const status = searchParams.get("status");
    const connectionId = searchParams.get("connectionId");

    // Validate and parse limit
    let limit = DEFAULT_LIMIT;
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        limit = Math.min(parsedLimit, MAX_LIMIT);
      }
    }

    // Build query with NoSQL injection protection
    interface DiscordMessageQuery {
      userId: Types.ObjectId;
      processingStatus?: string;
      connectionId?: Types.ObjectId;
    }

    const query: DiscordMessageQuery = {
      userId: new Types.ObjectId(String(user._id)),
    };

    // Validate and add status filter
    if (status) {
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              message: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
              code: "VALIDATION_ERROR",
              statusCode: 400,
            },
          },
          { status: 400 }
        );
      }
      query.processingStatus = status;
    }

    // Validate and add connectionId filter
    if (connectionId) {
      if (!Types.ObjectId.isValid(connectionId)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              message: "Invalid connectionId format",
              code: "VALIDATION_ERROR",
              statusCode: 400,
            },
          },
          { status: 400 }
        );
      }

      // Verify connection belongs to user
      const connection = await DiscordConnection.findOne({
        _id: new Types.ObjectId(connectionId),
        userId: user._id,
      }).lean();

      if (!connection) {
        return NextResponse.json(
          {
            success: false,
            error: {
              message: "Connection not found or access denied",
              code: "NOT_FOUND",
              statusCode: 404,
            },
          },
          { status: 404 }
        );
      }

      query.connectionId = new Types.ObjectId(connectionId);
    }

    // Fetch messages with connection info via aggregation
    const messages = await DiscordMessage.aggregate([
      { $match: query },
      { $sort: { createdAt: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: "discordconnections",
          localField: "connectionId",
          foreignField: "_id",
          as: "connection",
          pipeline: [
            {
              $project: {
                _id: 1,
                serverName: 1,
                channelName: 1,
                serverId: 1,
                channelId: 1,
              },
            },
          ],
        },
      },
      {
        $addFields: {
          connection: { $arrayElemAt: ["$connection", 0] },
        },
      },
    ]);

    return NextResponse.json({
      success: true,
      messages: serializeResponse(messages),
      count: messages.length,
      limit,
    });
  } catch (error) {
    // Only log in development
    if (process.env.NODE_ENV !== "production") {
      console.error("GET /api/discord/messages error:", error);
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

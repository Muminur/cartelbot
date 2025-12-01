import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/middleware/admin-auth";
import { connectDB } from "@/lib/db";
import { Signal } from "@/lib/db/models";
import { escapeRegex, validatePagination, isValidObjectId } from "@/lib/utils/validation";
import { serializeDocuments, serializeDocument } from "@/lib/utils/serialize";

interface SignalQuery {
  status?: string;
  symbol?: { $regex: string; $options: string };
  userEmail?: { $regex: string; $options: string };
}

export async function GET(request: Request) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.response;

  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const rawPage = parseInt(searchParams.get("page") || "1");
    const rawLimit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status") || "all";
    const symbol = searchParams.get("symbol") || "";
    const userEmail = searchParams.get("userEmail") || "";

    // Validate pagination parameters
    const { page, limit } = validatePagination(rawPage, rawLimit);

    // Build query with sanitized inputs (excluding userEmail since it's not in Signal schema)
    const query: Partial<SignalQuery> = {};

    if (status !== "all") {
      query.status = status;
    }

    if (symbol) {
      query.symbol = { $regex: escapeRegex(symbol), $options: "i" };
    }

    const skip = (page - 1) * limit;

    // Build aggregation pipeline to join with User collection for email
    const aggregationPipeline: any[] = [
      { $match: query },
      {
        $lookup: {
          from: 'users',
          let: { userIdStr: '$userId' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: [{ $toString: '$_id' }, '$$userIdStr'] }
              }
            },
            {
              $project: { email: 1 }
            }
          ],
          as: 'user'
        }
      },
      {
        $addFields: {
          userEmail: { $arrayElemAt: ['$user.email', 0] }
        }
      },
      { $project: { user: 0 } } // Remove joined user object
    ];

    // Add userEmail filter AFTER lookup (since userEmail is computed)
    if (userEmail) {
      aggregationPipeline.push({
        $match: {
          userEmail: { $regex: escapeRegex(userEmail), $options: 'i' }
        }
      });
    }

    // Add sorting, skip, and limit
    aggregationPipeline.push(
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit }
    );

    // Create total count pipeline (excludes $skip and $limit, includes userEmail filter)
    const totalPipeline = [...aggregationPipeline.slice(0, -3), { $count: "total" }];

    const [signals, totalResult, stats] = await Promise.all([
      Signal.aggregate(aggregationPipeline),
      Signal.aggregate(totalPipeline),
      Signal.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const total = totalResult[0]?.total || 0;

    const statusStats = {
      pending: stats.find((s) => s._id === "pending")?.count || 0,
      parsed: stats.find((s) => s._id === "parsed")?.count || 0,
      executing: stats.find((s) => s._id === "executing")?.count || 0,
      completed: stats.find((s) => s._id === "completed")?.count || 0,
      failed: stats.find((s) => s._id === "failed")?.count || 0,
      cancelled: stats.find((s) => s._id === "cancelled")?.count || 0,
    };

    // Serialize MongoDB ObjectIds to strings (prevents [object Object] in admin UI)
    return NextResponse.json({
      success: true,
      data: serializeDocuments(signals),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: statusStats,
    });
  } catch (error) {
    console.error("Error fetching signals:", {
      error: error instanceof Error ? error.message : String(error),
      adminId: adminCheck.user?._id,
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SIGNALS_FETCH_FAILED",
          message: error instanceof Error ? error.message : "Failed to fetch signals",
          statusCode: 500,
        },
      },
      { status: 500 }
    );
  }
}

interface AllowedSignalUpdates {
  status?: "pending" | "parsed" | "executing" | "completed" | "failed" | "cancelled";
  symbol?: string;
  entries?: number[];
  targets?: number[];
  stopLoss?: number;
}

// Update signal endpoint (for manual override)
export async function PATCH(request: Request) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.response;

  try {
    await connectDB();

    const body = await request.json();
    const { signalId, updates } = body;

    if (!signalId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "SIGNAL_ID_REQUIRED",
            message: "Signal ID is required",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    // Validate ObjectId format
    if (!isValidObjectId(signalId)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_SIGNAL_ID",
            message: "Invalid signal ID format",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    // Only allow certain fields to be updated
    const allowedUpdates: AllowedSignalUpdates = {};
    if (updates.status) allowedUpdates.status = updates.status;
    if (updates.symbol) allowedUpdates.symbol = updates.symbol;
    if (updates.entries) allowedUpdates.entries = updates.entries;
    if (updates.targets) allowedUpdates.targets = updates.targets;
    if (updates.stopLoss !== undefined) allowedUpdates.stopLoss = updates.stopLoss;

    const signal = await Signal.findByIdAndUpdate(
      signalId,
      { $set: allowedUpdates },
      { new: true }
    );

    if (!signal) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "SIGNAL_NOT_FOUND",
            message: "Signal not found",
            statusCode: 404,
          },
        },
        { status: 404 }
      );
    }

    // Serialize MongoDB ObjectIds to strings (prevents [object Object] in admin UI)
    return NextResponse.json({
      success: true,
      data: serializeDocument(signal),
    });
  } catch (error) {
    console.error("Error updating signal:", {
      error: error instanceof Error ? error.message : String(error),
      adminId: adminCheck.user?._id,
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SIGNAL_UPDATE_FAILED",
          message: error instanceof Error ? error.message : "Failed to update signal",
          statusCode: 500,
        },
      },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Trade } from "@/lib/db/models";
import { formatErrorResponse } from "@/lib/utils/errors";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    await connectDB();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status");
    const symbol = searchParams.get("symbol");

    const query: Record<string, unknown> = { userId: user._id };

    // Handle comma-separated status values (e.g., "open,partial" or "closed,cancelled")
    if (status) {
      const statusValues = status.split(",").map((s) => s.trim());
      if (statusValues.length === 1) {
        query.status = statusValues[0]; // Single status
      } else {
        query.status = { $in: statusValues }; // Multiple statuses - use MongoDB $in operator
      }
    }

    // Handle comma-separated symbol values (e.g., "BTCUSDT,ETHUSDT")
    if (symbol) {
      const symbolValues = symbol.split(",").map((s) => s.trim().toUpperCase());
      if (symbolValues.length === 1) {
        query.symbol = symbolValues[0]; // Single symbol
      } else {
        query.symbol = { $in: symbolValues }; // Multiple symbols - use MongoDB $in operator
      }
    }

    const skip = (page - 1) * limit;

    const [trades, total] = await Promise.all([
      Trade.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("signalId", "symbol entries targets stopLoss"),
      Trade.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: trades,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/trades error:", error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}

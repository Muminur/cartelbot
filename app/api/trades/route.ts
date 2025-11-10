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
    if (status) query.status = status;
    if (symbol) query.symbol = symbol;

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

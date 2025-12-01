import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/middleware/admin-auth";
import { connectDB } from "@/lib/db";
import { Trade } from "@/lib/db/models";
import { serializeDocuments } from "@/lib/utils/serialize";
import { isValidObjectId } from "@/lib/utils/validation";

export async function GET(request: Request) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.response;

  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const signalId = searchParams.get("signalId");
    const tradeId = searchParams.get("tradeId");
    const userId = searchParams.get("userId");

    const query: Record<string, unknown> = {};

    if (signalId) {
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
      query.signalId = signalId;
    }

    if (tradeId) {
      if (!isValidObjectId(tradeId)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "INVALID_TRADE_ID",
              message: "Invalid trade ID format",
              statusCode: 400,
            },
          },
          { status: 400 }
        );
      }
      query._id = tradeId;
    }

    if (userId) {
      query.userId = userId;
    }

    const trades = await Trade.find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return NextResponse.json({
      success: true,
      data: serializeDocuments(trades),
    });
  } catch (error) {
    console.error("Error fetching trades (admin):", {
      error: error instanceof Error ? error.message : String(error),
      adminId: adminCheck.user?._id,
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "TRADES_FETCH_FAILED",
          message: error instanceof Error ? error.message : "Failed to fetch trades",
          statusCode: 500,
        },
      },
      { status: 500 }
    );
  }
}

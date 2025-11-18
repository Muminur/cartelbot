import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { connectDB } from "@/lib/db/connection";
import { Trade } from "@/lib/db/models";

/**
 * POST /api/trades/[id]/update-pnl
 *
 * Updates the realized P&L for a trade (used to fix old trades with incorrect P&L calculation)
 *
 * Body:
 * {
 *   realizedPnL: number
 * }
 *
 * Returns:
 * - Updated trade object
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authenticate user
    const authResult = await getUserFromRequest(request);
    if (!authResult.user) {
      return NextResponse.json(
        { success: false, error: { message: "Unauthorized" } },
        { status: 401 }
      );
    }

    // 2. Parse request body
    const body = await request.json();
    const { realizedPnL } = body;

    if (realizedPnL === undefined || realizedPnL === null) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "realizedPnL is required",
            code: "INVALID_REQUEST",
          },
        },
        { status: 400 }
      );
    }

    // 3. Await params (Next.js async params)
    const resolvedParams = await params;
    const tradeId = resolvedParams.id;

    // 4. Connect to database
    await connectDB();

    // 5. Find and verify trade belongs to user
    const trade = await Trade.findOne({
      _id: tradeId,
      userId: String(authResult.user._id),
    });

    if (!trade) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Trade not found or unauthorized",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    // 6. Update P&L
    trade.realizedPnL = realizedPnL;
    await trade.save();

    console.log("[Update P&L API] Updated trade P&L:", {
      tradeId: trade._id,
      userId: authResult.user._id,
      oldPnL: trade.realizedPnL,
      newPnL: realizedPnL,
      timestamp: new Date().toISOString(),
    });

    // 7. Return updated trade
    return NextResponse.json({
      success: true,
      data: {
        trade: {
          _id: trade._id,
          realizedPnL: trade.realizedPnL,
          status: trade.status,
          investedAmount: trade.investedAmount,
        },
      },
    });
  } catch (error: unknown) {
    console.error("[Update P&L API] Error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          message:
            error instanceof Error ? error.message : "Failed to update P&L",
          code: "UPDATE_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

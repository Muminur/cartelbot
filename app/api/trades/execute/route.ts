import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { executeSignalTrade, createOCOOrders } from "@/lib/binance";
import { formatErrorResponse } from "@/lib/utils/errors";
import { Types } from "mongoose";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();

    const { signalId, investmentAmount, testnet = false, createOCO = true } = body;

    if (!signalId || !Types.ObjectId.isValid(signalId)) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Valid signal ID is required", statusCode: 400 },
        },
        { status: 400 }
      );
    }

    const result = await executeSignalTrade({
      userId: user._id,
      signalId: new Types.ObjectId(signalId),
      investmentAmount,
      testnet,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: { message: result.error || "Trade execution failed", statusCode: 400 },
        },
        { status: 400 }
      );
    }

    let ocoResult;
    if (createOCO && result.tradeId) {
      ocoResult = await createOCOOrders(result.tradeId, testnet);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          tradeId: result.tradeId,
          buyOrder: result.buyOrder,
          ocoOrders: ocoResult?.orders,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/trades/execute error:", error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}

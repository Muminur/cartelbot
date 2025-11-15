import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { executeSignalTrade, createOCOOrders } from "@/lib/binance";
import { formatErrorResponse } from "@/lib/utils/errors";
import { TRADE_EXECUTION } from "@/lib/constants";
import { Types } from "mongoose";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();

    const {
      signalId,
      investmentAmount,
      positionSizingMethod = "fixed",
      positionSizingPercentage,
      positionSizingRiskPercent,
      testnet: testnetParam,
      createOCO = true,
    } = body;

    // Use testnet parameter if provided, otherwise use user preference
    const testnet = testnetParam ?? user.useTestnet ?? false;

    // Debug logging to trace testnet resolution
    console.log("[Trade Execute] Testnet configuration:", {
      testnetParam,
      userUseTestnet: user.useTestnet,
      resolvedTestnet: testnet,
      userId: user._id,
      userEmail: user.email,
    });

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
      positionSizingMethod,
      positionSizingPercentage,
      positionSizingRiskPercent,
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
    if (createOCO && result.tradeId && !result.requiresApproval) {
      // Wait for balance settlement (both testnet and mainnet have settlement delays)
      const settlementDelay = testnet
        ? TRADE_EXECUTION.TESTNET_SETTLEMENT_DELAY_MS
        : TRADE_EXECUTION.MAINNET_SETTLEMENT_DELAY_MS;

      console.log(
        `[Trade Execute] Waiting ${settlementDelay}ms for balance settlement ` +
        `(${testnet ? 'testnet' : 'mainnet'}) before creating OCO orders (tradeId: ${result.tradeId})`
      );
      await new Promise(resolve => setTimeout(resolve, settlementDelay));
      console.log(`[Trade Execute] Settlement delay complete, proceeding with OCO creation`);

      const ocoStartTime = Date.now();
      ocoResult = await createOCOOrders(result.tradeId, testnet);
      const ocoTotalTime = Date.now() - ocoStartTime;

      if (ocoResult.success) {
        console.log(`[Trade Execute] OCO orders created successfully in ${ocoTotalTime}ms`);
      } else {
        console.error(`[Trade Execute] OCO creation failed after ${ocoTotalTime}ms:`, ocoResult.error);

        // CRITICAL: Update signal status to 'failed' when OCO creation fails
        // This ensures the UI can show the failure clearly
        const { Signal } = await import('@/lib/db/models');
        await Signal.findByIdAndUpdate(signalId, {
          status: 'failed',
        });

        console.log(`[Trade Execute] Signal ${signalId} marked as 'failed' due to OCO creation error`);
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          tradeId: result.tradeId,
          buyOrder: result.buyOrder,
          ocoOrders: ocoResult?.orders,
          ocoError: ocoResult?.success === false ? ocoResult.error : undefined,
          requiresApproval: result.requiresApproval,
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

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { executeSignalTrade, createOCOOrders } from "@/lib/binance";
import { formatErrorResponse } from "@/lib/utils/errors";
import { TRADE_EXECUTION } from "@/lib/constants";
import { Types } from "mongoose";
import { categorizeError } from "@/lib/utils/error-categorization";
import { serializeResponse } from "@/lib/utils/serialize";
import { sendTradeExecutedNotification } from "@/lib/email/notifications";

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
      // Categorize the error for detailed response
      const failureReason = result.error ? categorizeError(new Error(result.error)) : 'UNKNOWN';

      return NextResponse.json(
        serializeResponse({
          success: false,
          error: {
            message: result.error || "Trade execution failed",
            code: 'TRADE_EXECUTION_FAILED',
            statusCode: 400,
            failureStage: 'buy_order',
            failureReason,
            retryable: true,
          },
        }),
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

        // Send trade execution notification asynchronously (don't block response)
        sendTradeExecutedNotification({
          userId: user._id as Types.ObjectId,
          tradeId: result.tradeId as Types.ObjectId,
          symbol: result.buyOrder?.symbol || '',
          side: 'BUY',
          quantity: parseFloat(result.buyOrder?.executedQty || '0'),
          price: result.buyOrder?.fills?.[0]
            ? parseFloat(result.buyOrder.fills[0].price)
            : 0,
          totalAmount: parseFloat(result.buyOrder?.cummulativeQuoteQty || '0'),
          timestamp: result.buyOrder?.transactTime
            ? new Date(result.buyOrder.transactTime)
            : new Date(),
          orderId: result.buyOrder?.orderId || 0,
        }).catch(error => {
          // Log error but don't fail the trade execution
          console.error('[Trade Execute] Failed to send notification:', error);
        });
      } else {
        console.error(`[Trade Execute] OCO creation failed after ${ocoTotalTime}ms:`, ocoResult.error);

        // Error is already persisted by createOCOOrders() in trade-executor.ts
        // Just return detailed error response to frontend
        const failureReason = ocoResult.error ? categorizeError(new Error(ocoResult.error)) : 'UNKNOWN';

        return NextResponse.json(
          serializeResponse({
            success: false,
            error: {
              message: ocoResult.error || 'OCO order creation failed',
              code: 'OCO_CREATION_FAILED',
              statusCode: 400,
              failureStage: 'oco_creation',
              failureReason,
              tradeId: result.tradeId,
              buyOrder: result.buyOrder,
              retryable: true,
            },
          }),
          { status: 400 }
        );
      }
    }

    // Serialize MongoDB ObjectIds to strings (prevents [object Object] in URLs)
    return NextResponse.json(
      {
        success: true,
        data: serializeResponse({
          tradeId: result.tradeId,
          buyOrder: result.buyOrder,
          ocoOrders: ocoResult?.orders,
          ocoError: ocoResult?.success === false ? ocoResult.error : undefined,
          requiresApproval: result.requiresApproval,
        }),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/trades/execute error:", error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      serializeResponse({ success: false, ...errorResponse }),
      { status: errorResponse.error.statusCode }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { connectDB } from "@/lib/db/connection";
import { Signal, Trade } from "@/lib/db/models";
import { markSignalCompleted } from "@/lib/binance/signal-status-manager";

/**
 * POST /api/signals/[id]/update-status
 *
 * Updates signal and trade status based on real-time order status from Binance
 *
 * Body:
 * {
 *   allTargetsFilled: boolean,
 *   stopLossTriggered: boolean,
 *   tradeId: string,
 *   exitPrice?: number,
 *   realizedPnL?: number
 * }
 *
 * Returns:
 * - Updated signal and trade status
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
    const {
      allTargetsFilled,
      stopLossTriggered,
      tradeId,
      exitPrice,
      realizedPnL,
      filledTargetNumbers,
      stopLossFillCount,
      totalStopLossOrders,
    } = body;

    // 3. Await params (Next.js async params)
    const resolvedParams = await params;
    const signalId = resolvedParams.id;

    if (!signalId || !tradeId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Signal ID and Trade ID are required",
            code: "INVALID_REQUEST",
          },
        },
        { status: 400 }
      );
    }

    // 4. Connect to database
    await connectDB();

    // 5. Verify signal belongs to user
    const signal = await Signal.findOne({
      _id: signalId,
      userId: String(authResult.user._id),
    });

    if (!signal) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Signal not found or unauthorized",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    // 6. Verify trade belongs to user
    const trade = await Trade.findOne({
      _id: tradeId,
      userId: String(authResult.user._id),
      signalId: signalId,
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

    // 7. Check if status update is needed
    let updated = false;
    let updatedSignal = signal;
    let updatedTrade = trade;

    // Only update if signal is currently "executing" (not already completed/failed)
    if (signal.status === "executing" && trade.status === "open") {
      // CRITICAL FIX #1: Operator precedence fix for signal status validation
      // Logic: Valid close if (all targets filled AND at least one filled target) OR stop loss triggered
      // Previous bug: (A && B) || C evaluated to true whenever C was true, bypassing validation
      const hasValidClose =
        (allTargetsFilled && filledTargetNumbers && Array.isArray(filledTargetNumbers) && filledTargetNumbers.length > 0) ||
        stopLossTriggered;

      if (!hasValidClose) {
        // BUG 3 FIX: Trade closed but no orders filled - mark as failed
        signal.status = "failed";
        signal.failureReason = "Trade closed but no take profit targets or stop loss were filled";
        await signal.save();

        trade.status = "closed";
        trade.closeReason = "cancelled";
        trade.closeReasonDetail = "No Orders Filled";
        await trade.save();

        console.warn("[Signal Status Update] Trade closed with no filled orders:", {
          signalId: signal._id,
          tradeId: trade._id,
          allTargetsFilled,
          stopLossTriggered,
          filledTargetNumbers,
        });

        return NextResponse.json({
          success: true,
          data: {
            updated: true,
            signal: {
              _id: signal._id,
              status: signal.status,
              failureReason: signal.failureReason,
            },
            trade: {
              _id: trade._id,
              status: trade.status,
              closeReason: trade.closeReason,
            },
          },
        });
      }

      if (allTargetsFilled || stopLossTriggered) {
        // Update trade status
        trade.status = "closed";

        // Determine close reason (enum value) and detail (human-readable)
        let closeReason: "target" | "stop_loss";
        let closeReasonDetail: string;

        if (stopLossTriggered) {
          closeReason = "stop_loss";

          // Provide detailed information about how many SL orders filled
          if (stopLossFillCount !== undefined && totalStopLossOrders !== undefined) {
            if (stopLossFillCount === 1) {
              closeReasonDetail = "Stop Loss Hit";
            } else if (stopLossFillCount === totalStopLossOrders) {
              closeReasonDetail = `All ${totalStopLossOrders} Stop Losses Hit`;
            } else {
              closeReasonDetail = `${stopLossFillCount} of ${totalStopLossOrders} Stop Losses Hit`;
            }
          } else {
            // Fallback if counts not provided
            closeReasonDetail = "Stop Loss Hit";
          }
        } else if (filledTargetNumbers && Array.isArray(filledTargetNumbers) && filledTargetNumbers.length > 0) {
          // FIX BUG 1 (API side): Remove duplicates from filledTargetNumbers before joining
          const uniqueTargets = Array.from(new Set(filledTargetNumbers)).sort((a, b) => a - b);

          closeReason = "target";

          // Multiple targets filled
          if (uniqueTargets.length === 1) {
            closeReasonDetail = `Target ${uniqueTargets[0]} Hit`;
          } else {
            closeReasonDetail = `Targets ${uniqueTargets.join(', ')} Hit`;
          }
        } else {
          // Fallback if no target numbers provided
          closeReason = "target";
          closeReasonDetail = "Target Hit";
        }

        trade.closeReason = closeReason;
        trade.closeReasonDetail = closeReasonDetail;

        if (exitPrice !== undefined) {
          trade.exitPrice = exitPrice;
        }

        if (realizedPnL !== undefined) {
          trade.realizedPnL = realizedPnL;
        }

        await trade.save();
        updatedTrade = trade;

        // Update signal status using centralized helper
        const reason = stopLossTriggered ? "stop_loss" : "target";
        await markSignalCompleted(signal._id, trade._id, reason);

        // Fetch updated signal
        const freshSignal = await Signal.findById(signalId);
        if (freshSignal) {
          updatedSignal = freshSignal;
        }

        updated = true;

        console.log("[Signal Status Update] Updated signal and trade:", {
          signalId: signal._id,
          tradeId: trade._id,
          oldSignalStatus: "executing",
          newSignalStatus: updatedSignal.status,
          oldTradeStatus: "open",
          newTradeStatus: trade.status,
          reason,
          closeReasonDetail: trade.closeReasonDetail,
          exitPrice,
          realizedPnL,
          stopLossInfo: stopLossTriggered ? {
            filledCount: stopLossFillCount,
            totalCount: totalStopLossOrders,
            allFilled: stopLossFillCount === totalStopLossOrders,
          } : undefined,
        });
      }
    } else {
      console.log("[Signal Status Update] No update needed:", {
        signalId: signal._id,
        currentSignalStatus: signal.status,
        currentTradeStatus: trade.status,
        allTargetsFilled,
        stopLossTriggered,
      });
    }

    // 8. Return updated status
    return NextResponse.json({
      success: true,
      data: {
        updated,
        signal: {
          _id: updatedSignal._id,
          status: updatedSignal.status,
        },
        trade: {
          _id: updatedTrade._id,
          status: updatedTrade.status,
          closeReason: updatedTrade.closeReason,
          exitPrice: updatedTrade.exitPrice,
          realizedPnL: updatedTrade.realizedPnL,
        },
      },
    });
  } catch (error: unknown) {
    console.error("[Signal Status Update API] Error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          message:
            error instanceof Error
              ? error.message
              : "Failed to update signal status",
          code: "UPDATE_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

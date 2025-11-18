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
    const { allTargetsFilled, stopLossTriggered, tradeId, exitPrice, realizedPnL, filledTargetNumbers } = body;

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
      if (allTargetsFilled || stopLossTriggered) {
        // Update trade status
        trade.status = "closed";

        // Determine specific close reason based on which targets were filled
        let closeReason: string;
        if (stopLossTriggered) {
          closeReason = "Stop Loss Hit";
        } else if (filledTargetNumbers && Array.isArray(filledTargetNumbers) && filledTargetNumbers.length > 0) {
          // Multiple targets filled
          if (filledTargetNumbers.length === 1) {
            closeReason = `Target ${filledTargetNumbers[0]} Hit`;
          } else {
            closeReason = `Targets ${filledTargetNumbers.join(', ')} Hit`;
          }
        } else {
          // Fallback if no target numbers provided
          closeReason = "target";
        }

        trade.closeReason = closeReason;

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
          exitPrice,
          realizedPnL,
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

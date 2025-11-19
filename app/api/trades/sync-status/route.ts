import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Trade } from "@/lib/db/models";
import { getUserApiKeys } from "@/lib/db/helpers";
import { decrypt } from "@/lib/encryption";
import { BinanceClient } from "@/lib/binance/client";
import { resolveTestnetPreference } from "@/lib/binance/helpers";
import { formatErrorResponse } from "@/lib/utils/errors";
import { Types } from "mongoose";
import { markSignalCompleted } from "@/lib/binance/signal-status-manager";

/**
 * POST /api/trades/sync-status
 *
 * Syncs trade statuses with Binance API for all open/partial trades.
 * This endpoint is used to fix stale trade statuses where WebSocket events
 * may have been missed or not processed correctly.
 *
 * Process:
 * 1. Fetches all open/partial trades for the user
 * 2. For each trade, checks Binance API for current sell order statuses
 * 3. Updates trade status to "closed" if all sell orders are FILLED or CANCELED
 * 4. Calculates realized P&L based on actual Binance data
 * 5. Updates signal status accordingly
 */
export async function POST() {
  try {
    const user = await requireAuth();
    await connectDB();

    // Get user's API keys
    const apiKeys = await getUserApiKeys(user._id as Types.ObjectId);
    if (
      !apiKeys ||
      !("encryptedApiKey" in apiKeys) ||
      !("encryptedApiSecret" in apiKeys) ||
      !apiKeys.encryptedApiKey ||
      !apiKeys.encryptedApiSecret
    ) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Binance API keys not configured", statusCode: 400 },
        },
        { status: 400 }
      );
    }

    // Initialize Binance client
    const useTestnet = resolveTestnetPreference(apiKeys);
    const apiKey = decrypt(apiKeys.encryptedApiKey as string);
    const apiSecret = decrypt(apiKeys.encryptedApiSecret as string);
    const client = new BinanceClient({ apiKey, apiSecret, testnet: useTestnet });

    // Sync server time
    await client.syncServerTime();

    // Find all open/partial trades for this user
    const openTrades = await Trade.find({
      userId: user._id,
      status: { $in: ["open", "partial"] },
    });

    if (openTrades.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          message: "No open trades to sync",
          updatedCount: 0,
        },
      });
    }

    // Validate maximum trades to sync (prevent timeout/rate limit issues)
    const MAX_TRADES_TO_SYNC = 50;
    if (openTrades.length > MAX_TRADES_TO_SYNC) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: `Too many open trades (${openTrades.length}). Maximum ${MAX_TRADES_TO_SYNC} trades can be synced at once.`,
            code: "TOO_MANY_TRADES",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    // Calculate estimated API weight
    const totalApiCalls = openTrades.reduce(
      (sum, t) => sum + (t.sellOrders?.length || 0),
      0
    );
    const estimatedWeight = totalApiCalls * 4; // getOrder has weight 4

    if (estimatedWeight > 1000) {
      console.warn(
        `[Sync Status] High API weight: ${estimatedWeight} (${totalApiCalls} calls)`
      );
    }

    let updatedCount = 0;
    const errors: Array<{ tradeId: string; error: string }> = [];

    // Process each trade
    for (const trade of openTrades) {
      try {
        // Skip if no sell orders
        if (!trade.sellOrders || trade.sellOrders.length === 0) {
          continue;
        }

        // Fetch current status of all sell orders from Binance
        let allOrdersDone = true;
        let anyFilled = false;
        const updatedSellOrders = [];

        for (const sellOrder of trade.sellOrders) {
          try {
            // Query Binance for current order status
            const orderStatus = await client.getOrder(
              trade.symbol,
              sellOrder.orderId
            );

            // Update order status
            const updatedOrder = {
              ...sellOrder,
              status: orderStatus.status,
              executedQty: parseFloat(orderStatus.executedQty || "0"),
              cummulativeQuoteQty: parseFloat(orderStatus.cummulativeQuoteQty || "0"),
            };

            updatedSellOrders.push(updatedOrder);

            // Check if this order is done
            if (orderStatus.status === "FILLED") {
              anyFilled = true;
            } else if (
              orderStatus.status !== "CANCELED" &&
              orderStatus.status !== "EXPIRED" &&
              orderStatus.status !== "REJECTED"
            ) {
              // Order is still active (NEW, PARTIALLY_FILLED, etc.)
              allOrdersDone = false;
            }
          } catch (orderError) {
            // If order not found on Binance, treat as CANCELED
            if (
              orderError instanceof Error &&
              orderError.message.includes("Order does not exist")
            ) {
              updatedSellOrders.push({
                ...sellOrder,
                status: "CANCELED",
              });
            } else {
              // For other errors, keep original status and mark as not done
              updatedSellOrders.push(sellOrder);
              allOrdersDone = false;
              console.error(
                `Error fetching order ${sellOrder.orderId} for trade ${trade._id}:`,
                orderError
              );
            }
          }
        }

        // Update sell orders in trade
        trade.sellOrders = updatedSellOrders;

        // If all orders are done and at least one was filled, close the trade
        if (allOrdersDone && anyFilled) {
          // Calculate actual P&L from Binance data
          const buyCost = trade.buyOrder.cummulativeQuoteQty;
          const filledOrders = updatedSellOrders.filter((o) => o.status === "FILLED");

          const sellRevenue = filledOrders.reduce(
            (sum, order) => sum + order.cummulativeQuoteQty,
            0
          );
          const totalExecutedQty = filledOrders.reduce(
            (sum, order) => sum + order.executedQty,
            0
          );

          // Update trade with actual values
          trade.exitPrice = totalExecutedQty > 0 ? sellRevenue / totalExecutedQty : 0;
          trade.realizedPnL = sellRevenue - buyCost;
          trade.status = "closed";

          // Determine close reason based on order types
          const hasStopLoss = updatedSellOrders.some(
            (o) => o.type === "STOP_LOSS_LIMIT" && o.status === "FILLED"
          );

          if (hasStopLoss) {
            trade.closeReason = "stop_loss";
            trade.closeReasonDetail = "Stop Loss Hit";
          } else {
            // Find which targets hit (using actual target positions, not filtered index)
            const targetNumbers = updatedSellOrders
              .map((order, idx) => ({ order, targetNum: idx + 1 }))
              .filter(
                ({ order }) =>
                  order.type === "LIMIT_MAKER" && order.status === "FILLED"
              )
              .map(({ targetNum }) => targetNum)
              .join(",");

            if (targetNumbers) {
              trade.closeReason = "target";
              trade.closeReasonDetail =
                targetNumbers.includes(",")
                  ? `Targets ${targetNumbers} Hit`
                  : `Target ${targetNumbers} Hit`;
            } else {
              trade.closeReason = "target";
              trade.closeReasonDetail = "Target Hit";
            }
          }

          await trade.save();
          updatedCount++;

          // Update signal status
          if (trade.signalId) {
            await markSignalCompleted(
              trade.signalId,
              trade._id,
              hasStopLoss ? "stop_loss" : "target"
            );
          }

          console.log(`Synced trade ${trade._id}: ${trade.status} (${trade.closeReasonDetail})`);
        } else {
          // Just update the sell orders
          await trade.save();
          console.log(`Updated sell orders for trade ${trade._id}`);
        }
      } catch (tradeError) {
        const errorMessage =
          tradeError instanceof Error ? tradeError.message : String(tradeError);
        errors.push({
          tradeId: String(trade._id),
          error: errorMessage,
        });
        console.error(`Error syncing trade ${trade._id}:`, tradeError);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        message: `Synced ${openTrades.length} trade(s), updated ${updatedCount} to closed status`,
        totalProcessed: openTrades.length,
        updatedCount,
        apiCallsUsed: totalApiCalls,
        estimatedWeight: estimatedWeight,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error) {
    console.error("POST /api/trades/sync-status error:", error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}

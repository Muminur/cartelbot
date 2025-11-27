import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Signal } from "@/lib/db/models/Signal";
import { Trade } from "@/lib/db/models/Trade";
import { User } from "@/lib/db/models/User";
import { OrphanedCoin } from "@/lib/db/models/OrphanedCoin";
import { BinanceClient } from "@/lib/binance";
import { decrypt } from "@/lib/encryption";
import { BinanceAPIError } from "@/lib/utils/errors";
import { APIResponse } from "@/types";

interface DeleteSignalRequest {
  sellRemaining: boolean;
}

interface DeleteSignalResponse {
  success: boolean;
  message: string;
  orphanedCoinId?: string;
  sellOrderId?: number;
  cancelledOCOs?: number[];
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<APIResponse<DeleteSignalResponse>>> {
  try {
    const { id: signalId } = await params;

    // 1. Authenticate user
    const { user, error } = await getUserFromRequest(request);
    if (!user || error) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Unauthorized", code: "UNAUTHORIZED", statusCode: 401 },
        },
        { status: 401 }
      );
    }

    // 2. Get request body
    const body = (await request.json()) as DeleteSignalRequest;
    const { sellRemaining } = body;

    if (process.env.NODE_ENV !== 'production') console.log(`[Delete Signal] User ${user.email} deleting signal ${signalId}`, {
      sellRemaining,
    });

    // 3. Connect to database
    await connectDB();

    // 4. Get signal and verify ownership
    const signal = await Signal.findById(signalId);
    if (!signal) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Signal not found", code: "SIGNAL_NOT_FOUND", statusCode: 404 },
        },
        { status: 404 }
      );
    }

    if (signal.userId !== String(user._id)) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Unauthorized", code: "UNAUTHORIZED", statusCode: 403 },
        },
        { status: 403 }
      );
    }

    // 5. Find associated trade
    const trade = await Trade.findOne({ signalId: String(signal._id) });

    // If no trade exists, just mark signal as deleted
    if (!trade) {
      signal.status = "cancelled";
      await signal.save();

      if (process.env.NODE_ENV !== 'production') console.log(`[Delete Signal] No trade found for signal ${signalId}, marked as cancelled`);

      return NextResponse.json({
        success: true,
        data: {
          success: true,
          message: "Signal deleted successfully (no trade associated)",
        },
      });
    }

    // 6. Get user's testnet preference and API keys
    const userWithKeys = await User.findById(user._id).select(
      "+encryptedApiKey +encryptedApiSecret"
    );

    if (
      !userWithKeys ||
      !userWithKeys.encryptedApiKey ||
      !userWithKeys.encryptedApiSecret
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Binance API keys not configured",
            code: "NO_API_KEYS",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    // 7. Decrypt API keys
    const apiKey = decrypt(userWithKeys.encryptedApiKey);
    const apiSecret = decrypt(userWithKeys.encryptedApiSecret);
    const testnet = userWithKeys.useTestnet ?? false;

    if (process.env.NODE_ENV !== 'production') console.log(`[Delete Signal] Using ${testnet ? "testnet" : "mainnet"} for ${signal.symbol}`);

    // 8. Initialize Binance client
    const binanceClient = new BinanceClient({
      apiKey,
      apiSecret,
      testnet,
    });

    // 9. Cancel all open OCO orders using stored orderListId
    const cancelledOCOs: number[] = [];

    if (trade.sellOrders && trade.sellOrders.length > 0) {
      // Track unique orderListIds to avoid duplicate cancellations
      const processedOrderListIds = new Set<number>();

      for (const sellOrder of trade.sellOrders) {
        // Only cancel if order is still open
        if (sellOrder.status === "NEW" || sellOrder.status === "PARTIALLY_FILLED") {
          try {
            // Use stored orderListId if available (preferred method - no race condition)
            if (sellOrder.orderListId && sellOrder.orderListId > 0) {
              // Skip if already processed (multiple sell orders can have same orderListId)
              if (processedOrderListIds.has(sellOrder.orderListId)) {
                if (process.env.NODE_ENV !== 'production') console.log(
                  `[Delete Signal] Skipping duplicate orderListId ${sellOrder.orderListId}`
                );
                continue;
              }

              await binanceClient.cancelOCOOrder(signal.symbol, sellOrder.orderListId);
              cancelledOCOs.push(sellOrder.orderListId);
              processedOrderListIds.add(sellOrder.orderListId);

              if (process.env.NODE_ENV !== 'production') console.log(
                `[Delete Signal] Cancelled OCO order ${sellOrder.orderListId} for ${signal.symbol} (stored orderListId)`
              );
            } else {
              // Fallback: query all orders (includes filled orders) if orderListId not stored
              // This handles orders created before the orderListId field was added
              console.warn(
                `[Delete Signal] No orderListId stored for order ${sellOrder.orderId}, using fallback method`
              );

              const allOrders = await binanceClient.getAllOrders(signal.symbol);
              const ocoOrder = allOrders.find((o) => o.orderId === sellOrder.orderId);

              if (ocoOrder && ocoOrder.orderListId > 0) {
                // Skip if already processed
                if (processedOrderListIds.has(ocoOrder.orderListId)) {
                  if (process.env.NODE_ENV !== 'production') console.log(
                    `[Delete Signal] Skipping duplicate orderListId ${ocoOrder.orderListId} (fallback)`
                  );
                  continue;
                }

                await binanceClient.cancelOCOOrder(signal.symbol, ocoOrder.orderListId);
                cancelledOCOs.push(ocoOrder.orderListId);
                processedOrderListIds.add(ocoOrder.orderListId);

                if (process.env.NODE_ENV !== 'production') console.log(
                  `[Delete Signal] Cancelled OCO order ${ocoOrder.orderListId} for ${signal.symbol} (fallback method)`
                );
              } else {
                console.warn(
                  `[Delete Signal] Order ${sellOrder.orderId} not found in all orders or has no orderListId`
                );
              }
            }
          } catch (error) {
            // Handle case where order is already filled or cancelled
            if (error instanceof BinanceAPIError && error.binanceCode === -2011) {
              if (process.env.NODE_ENV !== 'production') console.log(
                `[Delete Signal] OCO order ${sellOrder.orderListId || sellOrder.orderId} already filled/cancelled`
              );
              continue;
            }

            // Log error but continue with deletion
            console.error(
              `[Delete Signal] Error cancelling OCO order ${sellOrder.orderListId || sellOrder.orderId}:`,
              {
                error: error instanceof Error ? error.message : String(error),
                binanceCode:
                  error instanceof BinanceAPIError ? error.binanceCode : undefined,
              }
            );
          }
        }
      }
    }

    // 10. Calculate remaining quantity
    let remainingQuantity = trade.buyOrder.executedQty;

    // Subtract already sold quantities
    for (const sellOrder of trade.sellOrders) {
      if (sellOrder.status === "FILLED") {
        remainingQuantity -= sellOrder.executedQty;
      }
    }

    if (process.env.NODE_ENV !== 'production') console.log(`[Delete Signal] Remaining quantity: ${remainingQuantity} ${signal.symbol}`);

    // 11. Handle user choice: sell remaining or keep as orphaned
    if (sellRemaining && remainingQuantity > 0) {
      try {
        // Execute market sell order for remaining quantity
        const sellOrderResponse = await binanceClient.createMarketSellOrder(
          signal.symbol,
          remainingQuantity
        );

        if (process.env.NODE_ENV !== 'production') console.log(
          `[Delete Signal] Sold ${remainingQuantity} ${signal.symbol} at market price`,
          {
            orderId: sellOrderResponse.orderId,
            executedQty: sellOrderResponse.executedQty,
          }
        );

        // Update trade status
        trade.status = "closed";
        trade.closeReason = "manual";
        trade.closeReasonDetail = "Manual Close - Signal Deleted";
        trade.exitPrice = parseFloat(sellOrderResponse.fills?.[0]?.price || "0");

        // Calculate realized P&L
        // Get actual buy cost from Binance (what was actually spent)
        const buyCost = trade.buyOrder.cummulativeQuoteQty;

        // Get actual sell revenue from market sell order (what was actually received)
        const sellRevenue = parseFloat(sellOrderResponse.cummulativeQuoteQty || "0");

        // FIX: Realized P&L = Sell Revenue - Buy Cost (both from Binance API, not user input)
        trade.realizedPnL = sellRevenue - buyCost;

        await trade.save();

        // Update signal status
        signal.status = "cancelled";
        await signal.save();

        return NextResponse.json({
          success: true,
          data: {
            success: true,
            message: `Signal deleted and ${remainingQuantity} ${signal.symbol} sold at market price`,
            sellOrderId: sellOrderResponse.orderId,
            cancelledOCOs,
          },
        });
      } catch (error) {
        console.error(`[Delete Signal] Error selling remaining quantity:`, {
          error: error instanceof Error ? error.message : String(error),
          binanceCode:
            error instanceof BinanceAPIError ? error.binanceCode : undefined,
        });

        // If sell fails, create orphaned coin as fallback
        let orphanedCoin;
        try {
          orphanedCoin = await OrphanedCoin.create({
            userId: String(user._id),
            signalId: String(signal._id),
            tradeId: String(trade._id),
            symbol: signal.symbol,
            quantity: remainingQuantity,
            buyPrice: trade.entryPrice,
            buyOrderId: trade.buyOrder.orderId,
            buyTimestamp: trade.buyOrder.timestamp,
            status: "active",
          });
        } catch (error: unknown) {
          // Handle duplicate key error (code 11000) - orphaned coin already exists
          const isDuplicateKeyError =
            error instanceof Error &&
            "code" in error &&
            error.code === 11000;

          if (isDuplicateKeyError) {
            if (process.env.NODE_ENV !== 'production') console.log(
              `[Delete Signal] Orphaned coin already exists for trade ${trade._id}, updating existing record`
            );

            // Update existing orphaned coin instead of creating new one
            orphanedCoin = await OrphanedCoin.findOneAndUpdate(
              { userId: String(user._id), tradeId: String(trade._id) },
              {
                quantity: remainingQuantity,
                buyPrice: trade.entryPrice,
                status: "active",
              },
              { new: true, upsert: false }
            );

            if (!orphanedCoin) {
              throw new Error(
                "Failed to update existing orphaned coin record"
              );
            }
          } else {
            // Re-throw non-duplicate errors
            throw error;
          }
        }

        // Update trade status
        trade.status = "cancelled";
        trade.closeReason = "cancelled";
        trade.closeReasonDetail = "Signal Deleted - Market Sell Failed";
        await trade.save();

        // Update signal status
        signal.status = "cancelled";
        await signal.save();

        return NextResponse.json({
          success: true,
          data: {
            success: true,
            message: `Signal deleted. Failed to sell at market, created orphaned coin record.`,
            orphanedCoinId: String(orphanedCoin._id),
            cancelledOCOs,
          },
        });
      }
    } else {
      // User chose to keep coins - create orphaned coin record
      if (remainingQuantity > 0) {
        let orphanedCoin;
        try {
          orphanedCoin = await OrphanedCoin.create({
            userId: String(user._id),
            signalId: String(signal._id),
            tradeId: String(trade._id),
            symbol: signal.symbol,
            quantity: remainingQuantity,
            buyPrice: trade.entryPrice,
            buyOrderId: trade.buyOrder.orderId,
            buyTimestamp: trade.buyOrder.timestamp,
            status: "active",
          });

          if (process.env.NODE_ENV !== 'production') console.log(
            `[Delete Signal] Created orphaned coin record: ${remainingQuantity} ${signal.symbol}`,
            {
              orphanedCoinId: String(orphanedCoin._id),
            }
          );
        } catch (error: unknown) {
          // Handle duplicate key error (code 11000) - orphaned coin already exists
          const isDuplicateKeyError =
            error instanceof Error &&
            "code" in error &&
            error.code === 11000;

          if (isDuplicateKeyError) {
            if (process.env.NODE_ENV !== 'production') console.log(
              `[Delete Signal] Orphaned coin already exists for trade ${trade._id}, updating existing record`
            );

            // Update existing orphaned coin instead of creating new one
            orphanedCoin = await OrphanedCoin.findOneAndUpdate(
              { userId: String(user._id), tradeId: String(trade._id) },
              {
                quantity: remainingQuantity,
                buyPrice: trade.entryPrice,
                status: "active",
              },
              { new: true, upsert: false }
            );

            if (!orphanedCoin) {
              throw new Error(
                "Failed to update existing orphaned coin record"
              );
            }
          } else {
            // Re-throw non-duplicate errors
            throw error;
          }
        }

        // Update trade status
        trade.status = "cancelled";
        trade.closeReason = "cancelled";
        trade.closeReasonDetail = "Signal Deleted - Coins Saved";
        await trade.save();

        // Update signal status
        signal.status = "cancelled";
        await signal.save();

        return NextResponse.json({
          success: true,
          data: {
            success: true,
            message: `Signal deleted. ${remainingQuantity} ${signal.symbol} saved as orphaned coin.`,
            orphanedCoinId: String(orphanedCoin._id),
            cancelledOCOs,
          },
        });
      } else {
        // No remaining quantity
        trade.status = "closed";
        trade.closeReason = "cancelled";
        trade.closeReasonDetail = "Signal Deleted - No Remaining Coins";
        await trade.save();

        signal.status = "cancelled";
        await signal.save();

        return NextResponse.json({
          success: true,
          data: {
            success: true,
            message: "Signal deleted successfully (all quantities already sold)",
            cancelledOCOs,
          },
        });
      }
    }
  } catch (error) {
    console.error("[Delete Signal] Error:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : "Failed to delete signal",
          code: "DELETE_SIGNAL_ERROR",
          statusCode: 500,
        },
      },
      { status: 500 }
    );
  }
}

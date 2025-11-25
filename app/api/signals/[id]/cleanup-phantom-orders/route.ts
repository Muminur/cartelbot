import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { getUserFromRequest } from "@/lib/auth";
import { Signal } from "@/lib/db/models/Signal";
import { Trade } from "@/lib/db/models/Trade";
import { User } from "@/lib/db/models/User";
import { BinanceClient } from "@/lib/binance";
import { decrypt } from "@/lib/encryption";
import { BinanceOrderResponse } from "@/types";
import mongoose from "mongoose";

interface PhantomOrder {
  orderId: number;
  orderListId?: number;
  type: string;
  side: string;
  quantity: string;
  price: string;
  status: string;
  stopPrice?: string;
}

interface CleanupResult {
  success: boolean;
  cancelledOrders: Array<{
    orderId: number;
    type: string;
    quantity: string;
  }>;
  failedOrders: Array<{
    orderId: number;
    type: string;
    error: string;
  }>;
  totalFreedQuantity: string;
  baseAsset: string;
}

/**
 * FIX E1: Extract base asset from symbol supporting all Binance quote assets
 * Handles USDT, BUSD, USDC, FDUSD, BTC, ETH, BNB pairs
 */
const QUOTE_ASSETS = ['USDT', 'BUSD', 'USDC', 'FDUSD', 'BTC', 'ETH', 'BNB'] as const;

function extractBaseAsset(symbol: string): string {
  // Try each quote asset in order of likelihood
  for (const quoteAsset of QUOTE_ASSETS) {
    if (symbol.endsWith(quoteAsset)) {
      return symbol.slice(0, -quoteAsset.length);
    }
  }

  // Fallback: return the symbol as-is if no quote asset matched
  // This shouldn't happen for valid Binance symbols, but prevents empty strings
  return symbol;
}

/**
 * GET /api/signals/[id]/cleanup-phantom-orders
 * Preview phantom orders that will be cancelled
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: signalId } = await params;
  try {
    await connectDB();
    const userResult = await getUserFromRequest(request);

    if (!userResult.user) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Unauthorized" },
        },
        { status: 401 }
      );
    }

    const user = userResult.user;

    // FIX B2: Validate signal ID to prevent NoSQL injection
    if (!mongoose.Types.ObjectId.isValid(signalId)) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Invalid signal ID format" },
        },
        { status: 400 }
      );
    }

    // 1. Fetch the signal
    const signal = await Signal.findById(signalId);

    if (!signal) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Signal not found" },
        },
        { status: 404 }
      );
    }

    // 2. Verify ownership
    if (signal.userId !== String(user._id)) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "You don't have permission to cleanup this signal's orders" },
        },
        { status: 403 }
      );
    }

    // 3. Check signal status
    if (signal.status !== "failed" && signal.status !== "executing") {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: `Cannot cleanup orders for ${signal.status} signals. Only failed or executing signals can be cleaned up.`,
          },
        },
        { status: 400 }
      );
    }

    // 4. Find associated trade
    const trade = await Trade.findOne({ signalId: String(signal._id) });

    if (!trade) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "No trade found for this signal. Cannot cleanup orders.",
          },
        },
        { status: 404 }
      );
    }

    // 5. Get user's API keys
    const fullUser = await User.findById(user._id).select(
      "+encryptedApiKey +encryptedApiSecret useTestnet"
    );

    if (!fullUser?.encryptedApiKey || !fullUser?.encryptedApiSecret) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Binance API keys not configured" },
        },
        { status: 400 }
      );
    }

    // 6. Decrypt API keys and initialize client
    const apiKey = decrypt(fullUser.encryptedApiKey);
    const apiSecret = decrypt(fullUser.encryptedApiSecret);
    const useTestnet = fullUser.useTestnet ?? false;

    const binanceClient = new BinanceClient({
      apiKey,
      apiSecret,
      testnet: useTestnet,
    });

    // 7. Fetch all orders for this symbol (including filled/cancelled)
    // This allows users to see what happened to their orders
    const allOrders = await binanceClient.getAllOrders(signal.symbol, 500);

    // 8. Filter orders that belong to THIS trade
    const tradeOrderIds = new Set<number>();

    // Add buy order ID (if it exists and is still open - unlikely but possible)
    if (trade.buyOrder?.orderId) {
      tradeOrderIds.add(trade.buyOrder.orderId);
    }

    // Add all sell order IDs
    if (trade.sellOrders && trade.sellOrders.length > 0) {
      trade.sellOrders.forEach((order: { orderId?: number }) => {
        if (order.orderId) {
          tradeOrderIds.add(order.orderId);
        }
      });
    }

    // Filter all orders to only those belonging to this trade
    const tradeOrders: PhantomOrder[] = allOrders
      .filter((order) => tradeOrderIds.has(order.orderId))
      .map((order) => ({
        orderId: order.orderId,
        orderListId: order.orderListId || undefined,
        type: order.type,
        side: order.side,
        quantity: order.origQty,
        price: order.price,
        status: order.status,
        stopPrice: order.stopPrice,
      }));

    // Separate orders by status - only NEW/PARTIALLY_FILLED can be cancelled
    const phantomOrders = tradeOrders.filter(
      (order) => order.status === "NEW" || order.status === "PARTIALLY_FILLED"
    );
    const completedOrders = tradeOrders.filter(
      (order) => order.status !== "NEW" && order.status !== "PARTIALLY_FILLED"
    );

    // 9. Calculate total quantity that will be freed (only from phantom orders)
    // FIX C3: OCO orders have 2 legs with same quantity - only count once per OCO group
    const processedOCOGroups = new Set<number>();
    const totalQuantity = phantomOrders.reduce((sum, order) => {
      // If this is an OCO order (has orderListId)
      if (order.orderListId && order.orderListId > 0) {
        // Only count the first leg of each OCO group
        if (processedOCOGroups.has(order.orderListId)) {
          return sum; // Skip - already counted this OCO group
        }
        processedOCOGroups.add(order.orderListId);
        return sum + parseFloat(order.quantity);
      }

      // Regular order (not OCO) - count normally
      return sum + parseFloat(order.quantity);
    }, 0);

    // FIX E1: Extract base asset from symbol supporting all quote assets
    const baseAsset = extractBaseAsset(signal.symbol);

    return NextResponse.json({
      success: true,
      data: {
        phantomOrders,
        completedOrders, // Include completed orders so user can see what happened
        totalOrders: phantomOrders.length,
        totalQuantity: totalQuantity.toFixed(8),
        baseAsset,
        signal: {
          _id: signal._id,
          symbol: signal.symbol,
          status: signal.status,
        },
        trade: {
          _id: trade._id,
          buyOrderId: trade.buyOrder?.orderId,
          sellOrderIds: trade.sellOrders?.map((o: { orderId?: number }) => o.orderId) || [],
        },
      },
    });
  } catch (error) {
    console.error("Error previewing phantom orders:", error);

    return NextResponse.json(
      {
        success: false,
        error: {
          message:
            error instanceof Error
              ? error.message
              : "Failed to preview phantom orders",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/signals/[id]/cleanup-phantom-orders
 * Actually cancel the phantom orders
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: signalId } = await params;
  try {
    await connectDB();
    const userResult = await getUserFromRequest(request);

    if (!userResult.user) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Unauthorized" },
        },
        { status: 401 }
      );
    }

    const user = userResult.user;

    // FIX B2: Validate signal ID to prevent NoSQL injection
    if (!mongoose.Types.ObjectId.isValid(signalId)) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Invalid signal ID format" },
        },
        { status: 400 }
      );
    }

    // 1. Fetch the signal
    const signal = await Signal.findById(signalId);

    if (!signal) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Signal not found" },
        },
        { status: 404 }
      );
    }

    // 2. Verify ownership
    if (signal.userId !== String(user._id)) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "You don't have permission to cleanup this signal's orders" },
        },
        { status: 403 }
      );
    }

    // 3. Check signal status
    if (signal.status !== "failed" && signal.status !== "executing") {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: `Cannot cleanup orders for ${signal.status} signals. Only failed or executing signals can be cleaned up.`,
          },
        },
        { status: 400 }
      );
    }

    // 4. Find associated trade
    const trade = await Trade.findOne({ signalId: String(signal._id) });

    if (!trade) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "No trade found for this signal. Cannot cleanup orders.",
          },
        },
        { status: 404 }
      );
    }

    // 5. Get user's API keys
    const fullUser = await User.findById(user._id).select(
      "+encryptedApiKey +encryptedApiSecret useTestnet"
    );

    if (!fullUser?.encryptedApiKey || !fullUser?.encryptedApiSecret) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Binance API keys not configured" },
        },
        { status: 400 }
      );
    }

    // 6. Decrypt API keys and initialize client
    const apiKey = decrypt(fullUser.encryptedApiKey);
    const apiSecret = decrypt(fullUser.encryptedApiSecret);
    const useTestnet = fullUser.useTestnet ?? false;

    const binanceClient = new BinanceClient({
      apiKey,
      apiSecret,
      testnet: useTestnet,
    });

    // 7. Fetch all orders for this symbol (FIX C2: Use getAllOrders to match GET endpoint)
    // This prevents race conditions where orders might be missed between GET and POST calls
    const allOrders = await binanceClient.getAllOrders(signal.symbol, 500);

    // 8. Filter orders that belong to THIS trade
    const tradeOrderIds = new Set<number>();

    if (trade.buyOrder?.orderId) {
      tradeOrderIds.add(trade.buyOrder.orderId);
    }

    if (trade.sellOrders && trade.sellOrders.length > 0) {
      trade.sellOrders.forEach((order: { orderId?: number }) => {
        if (order.orderId) {
          tradeOrderIds.add(order.orderId);
        }
      });
    }

    // FIX C2: Filter by trade orders AND status (only NEW/PARTIALLY_FILLED can be cancelled)
    const phantomOrders = allOrders.filter(
      (order) =>
        tradeOrderIds.has(order.orderId) &&
        (order.status === "NEW" || order.status === "PARTIALLY_FILLED")
    );

    if (phantomOrders.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          message: "No phantom orders found to cleanup",
          cancelledOrders: [],
          failedOrders: [],
          totalFreedQuantity: "0",
          baseAsset: extractBaseAsset(signal.symbol), // FIX E1
        },
      });
    }

    // 9. Cancel each order
    const result: CleanupResult = {
      success: true,
      cancelledOrders: [],
      failedOrders: [],
      totalFreedQuantity: "0",
      baseAsset: extractBaseAsset(signal.symbol), // FIX E1
    };

    let totalFreed = 0;

    // Group orders by orderListId to avoid duplicate cancellations
    const processedOrderListIds = new Set<number>();

    for (const order of phantomOrders) {
      try {
        // If this is an OCO order (has orderListId), cancel the entire OCO group once
        if (order.orderListId && order.orderListId > 0) {
          // Skip if we already cancelled this OCO group
          if (processedOrderListIds.has(order.orderListId)) {
            continue;
          }

          await binanceClient.cancelOCOOrder(signal.symbol, order.orderListId);
          processedOrderListIds.add(order.orderListId);

          // Add all orders in this OCO group to cancelled list
          const ocoOrders = phantomOrders.filter(
            (o) => o.orderListId === order.orderListId
          );

          // FIX C3: OCO orders have 2 legs (LIMIT_MAKER + STOP_LOSS_LIMIT) with same quantity
          // Only count the quantity ONCE, not for both legs
          const uniqueQuantity = parseFloat(ocoOrders[0]?.origQty || "0");
          totalFreed += uniqueQuantity;

          ocoOrders.forEach((ocoOrder) => {
            result.cancelledOrders.push({
              orderId: ocoOrder.orderId,
              type: ocoOrder.type,
              quantity: ocoOrder.origQty,
            });
          });
        } else {
          // Regular order (not OCO)
          await binanceClient.cancelOrder(signal.symbol, order.orderId);

          result.cancelledOrders.push({
            orderId: order.orderId,
            type: order.type,
            quantity: order.origQty,
          });
          totalFreed += parseFloat(order.origQty);
        }
      } catch (error) {
        console.error(
          `Failed to cancel order ${order.orderId}:`,
          error instanceof Error ? error.message : error
        );

        result.failedOrders.push({
          orderId: order.orderId,
          type: order.type,
          error: error instanceof Error ? error.message : "Unknown error",
        });

        // Don't fail entirely - continue cancelling other orders
        result.success = result.failedOrders.length === 0;
      }
    }

    result.totalFreedQuantity = totalFreed.toFixed(8);

    // 10. Update signal status if all orders were cancelled successfully
    if (result.cancelledOrders.length > 0 && result.failedOrders.length === 0) {
      // Update trade status to 'cancelled'
      await Trade.findByIdAndUpdate(trade._id, {
        status: "cancelled",
        closeReason: "manual",
      });

      // FIX C2: Only mark signal as 'failed' if trade is also cancelled/failed
      // Verify trade status before updating signal
      const updatedTrade = await Trade.findById(trade._id);
      if (
        signal.status === "executing" &&
        updatedTrade &&
        (updatedTrade.status === "cancelled" || updatedTrade.status === "failed")
      ) {
        await Signal.findByIdAndUpdate(signalId, {
          status: "failed",
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error cleaning up phantom orders:", error);

    return NextResponse.json(
      {
        success: false,
        error: {
          message:
            error instanceof Error
              ? error.message
              : "Failed to cleanup phantom orders",
        },
      },
      { status: 500 }
    );
  }
}

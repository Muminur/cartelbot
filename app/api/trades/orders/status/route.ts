import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { BinanceClient } from "@/lib/binance";
import { decrypt } from "@/lib/encryption";
import { connectDB } from "@/lib/db/connection";
import { User } from "@/lib/db/models/User";
import { Trade } from "@/lib/db/models/Trade";

/**
 * POST /api/trades/orders/status
 *
 * Query individual order status from Binance API
 *
 * Body:
 * {
 *   orders: Array<{ symbol: string, orderId: number, orderListId: number }>
 * }
 *
 * Returns:
 * - Array of order statuses with real FILLED/CANCELED status from Binance
 */
export async function POST(request: NextRequest) {
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
    const { orders } = body;

    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Invalid request. Provide an array of orders to check.",
            code: "INVALID_REQUEST",
          },
        },
        { status: 400 }
      );
    }

    // 3. Get user's API keys from database
    await connectDB();

    const dbUser = await User.findById(authResult.user._id).select(
      "+encryptedApiKey +encryptedApiSecret useTestnet"
    );

    if (!dbUser?.encryptedApiKey || !dbUser?.encryptedApiSecret) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Binance API keys not configured. Please add them in Settings.",
            code: "API_KEYS_MISSING",
          },
        },
        { status: 400 }
      );
    }

    // 4. Decrypt API keys
    let apiKey: string;
    let apiSecret: string;

    try {
      apiKey = decrypt(dbUser.encryptedApiKey);
      apiSecret = decrypt(dbUser.encryptedApiSecret);
    } catch (decryptError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Failed to decrypt API keys. Please re-save your keys in Settings.",
            code: "DECRYPTION_FAILED",
          },
        },
        { status: 400 }
      );
    }

    // 5. Verify user owns these orders (SECURITY: Authorization check)
    const orderListIds = [...new Set(orders.map((o: any) => o.orderListId))];

    const trades = await Trade.find({
      userId: String(authResult.user._id),
      'sellOrders.orderListId': { $in: orderListIds }
    });

    if (trades.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Orders not found or unauthorized",
            code: "UNAUTHORIZED",
          },
        },
        { status: 404 }
      );
    }

    // 6. Determine network from first trade (all orders should be same network)
    const useTestnet = trades[0].testnet || false;

    // 7. Initialize Binance client
    const binanceClient = new BinanceClient({
      apiKey,
      apiSecret,
      testnet: useTestnet,
    });

    // 8. Query each order's status from Binance
    const orderStatuses = await Promise.allSettled(
      orders.map(async (order: any) => {
        try {
          const status = await binanceClient.getOrder(order.symbol, order.orderId);
          return {
            orderId: order.orderId,
            orderListId: order.orderListId,
            symbol: order.symbol,
            status: status.status, // FILLED, CANCELED, NEW, etc.
            executedQty: status.executedQty,
            origQty: status.origQty,
            price: status.price,
            stopPrice: status.stopPrice,
            type: status.type,
            updateTime: status.updateTime,
          };
        } catch (error) {
          // If order not found, return null (may have been archived)
          return {
            orderId: order.orderId,
            orderListId: order.orderListId,
            symbol: order.symbol,
            status: "NOT_FOUND",
            error: error instanceof Error ? error.message : "Order not found on Binance",
          };
        }
      })
    );

    // 9. Process results
    const results = orderStatuses.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      } else {
        return {
          orderId: orders[index].orderId,
          orderListId: orders[index].orderListId,
          symbol: orders[index].symbol,
          status: "ERROR",
          error: result.reason instanceof Error ? result.reason.message : "Failed to fetch order status",
        };
      }
    });

    // 10. Return results
    return NextResponse.json({
      success: true,
      data: {
        orders: results,
        network: useTestnet ? "testnet" : "mainnet",
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error: unknown) {
    console.error("[Order Status API] Error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : "Failed to fetch order statuses",
          code: "FETCH_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

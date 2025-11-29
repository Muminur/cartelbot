import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createSuccessResponse, createErrorResponse } from "@/lib/utils/api";
import { createBinanceClient } from "@/lib/binance/client";
import { decrypt } from "@/lib/encryption";
import { BinanceAPIError } from "@/lib/utils/errors";

interface CancellationResult {
  orderId: number;
  orderListId: number;
  symbol: string;
  type: "INDIVIDUAL" | "OCO";
  success: boolean;
  error?: string;
}

interface CancellationSummary {
  totalOrders: number;
  totalOCOs: number;
  canceledOrders: number;
  canceledOCOs: number;
  failedOrders: number;
  failedOCOs: number;
  results: CancellationResult[];
  errors: string[];
}

export async function POST(request: NextRequest) {
  try {
    // Admin authentication
    const user = await requireAdmin(request);

    const body = await request.json();
    const { symbol } = body;

    if (!symbol || typeof symbol !== "string") {
      return createErrorResponse(
        new Error("Symbol parameter is required"),
        400
      );
    }

    // Validate symbol format (uppercase letters only)
    if (!/^[A-Z]+$/.test(symbol)) {
      return createErrorResponse(
        new Error("Invalid symbol format. Must be uppercase letters (e.g., MINAUSDT)"),
        400
      );
    }

    // Get user's API keys
    if (!user.encryptedApiKey || !user.encryptedApiSecret) {
      return createErrorResponse(
        new Error("Binance API keys not configured"),
        400
      );
    }

    const apiKey = decrypt(user.encryptedApiKey);
    const apiSecret = decrypt(user.encryptedApiSecret);

    // Create Binance client
    const client = createBinanceClient(apiKey, apiSecret, user.useTestnet);

    // Sync server time before operations
    await client.syncServerTime();

    // Fetch all open orders for the symbol
    const openOrders = await client.getOpenOrders(symbol);

    if (openOrders.length === 0) {
      return createSuccessResponse({
        message: `No open orders found for ${symbol}`,
        summary: {
          totalOrders: 0,
          totalOCOs: 0,
          canceledOrders: 0,
          canceledOCOs: 0,
          failedOrders: 0,
          failedOCOs: 0,
          results: [],
          errors: [],
        },
      });
    }

    // Group orders by orderListId to identify OCO pairs
    const ocoGroups = new Map<number, typeof openOrders>();
    const individualOrders: typeof openOrders = [];

    for (const order of openOrders) {
      if (order.orderListId && order.orderListId !== -1) {
        const existing = ocoGroups.get(order.orderListId) || [];
        existing.push(order);
        ocoGroups.set(order.orderListId, existing);
      } else {
        individualOrders.push(order);
      }
    }

    const summary: CancellationSummary = {
      totalOrders: individualOrders.length,
      totalOCOs: ocoGroups.size,
      canceledOrders: 0,
      canceledOCOs: 0,
      failedOrders: 0,
      failedOCOs: 0,
      results: [],
      errors: [],
    };

    // Log start of cancellation
    if (process.env.NODE_ENV === "development") {
      console.log(`[Admin Cleanup] Starting cancellation for ${symbol}:`, {
        individualOrders: individualOrders.length,
        ocoGroups: ocoGroups.size,
        adminEmail: user.email,
        timestamp: new Date().toISOString(),
      });
    }

    // Cancel OCO orders first (by orderListId)
    for (const [orderListId, orders] of ocoGroups.entries()) {
      try {
        await client.cancelOCOOrder(symbol, orderListId);

        summary.canceledOCOs++;

        // Record success for all orders in this OCO
        for (const order of orders) {
          summary.results.push({
            orderId: order.orderId,
            orderListId,
            symbol,
            type: "OCO",
            success: true,
          });
        }

        if (process.env.NODE_ENV === "development") {
          console.log(`[Admin Cleanup] Canceled OCO ${orderListId}:`, {
            orders: orders.map(o => o.orderId),
          });
        }

        // Small delay to prevent rate limiting (100ms between OCO cancellations)
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        summary.failedOCOs++;

        const errorMessage = error instanceof BinanceAPIError
          ? `${error.message} (Code: ${error.binanceCode})`
          : error instanceof Error
          ? error.message
          : String(error);

        summary.errors.push(`OCO ${orderListId}: ${errorMessage}`);

        // Record failure for all orders in this OCO
        for (const order of orders) {
          summary.results.push({
            orderId: order.orderId,
            orderListId,
            symbol,
            type: "OCO",
            success: false,
            error: errorMessage,
          });
        }

        if (process.env.NODE_ENV === "development") {
          console.error(`[Admin Cleanup] Failed to cancel OCO ${orderListId}:`, errorMessage);
        }
      }
    }

    // Cancel individual orders
    for (const order of individualOrders) {
      try {
        await client.cancelOrder(symbol, order.orderId);

        summary.canceledOrders++;
        summary.results.push({
          orderId: order.orderId,
          orderListId: -1,
          symbol,
          type: "INDIVIDUAL",
          success: true,
        });

        if (process.env.NODE_ENV === "development") {
          console.log(`[Admin Cleanup] Canceled individual order ${order.orderId}`);
        }

        // Small delay to prevent rate limiting (50ms between individual cancellations)
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        summary.failedOrders++;

        const errorMessage = error instanceof BinanceAPIError
          ? `${error.message} (Code: ${error.binanceCode})`
          : error instanceof Error
          ? error.message
          : String(error);

        summary.errors.push(`Order ${order.orderId}: ${errorMessage}`);
        summary.results.push({
          orderId: order.orderId,
          orderListId: -1,
          symbol,
          type: "INDIVIDUAL",
          success: false,
          error: errorMessage,
        });

        if (process.env.NODE_ENV === "development") {
          console.error(`[Admin Cleanup] Failed to cancel order ${order.orderId}:`, errorMessage);
        }
      }
    }

    // Cleanup client resources
    client.destroy();

    // Log completion
    if (process.env.NODE_ENV === "development") {
      console.log(`[Admin Cleanup] Completed for ${symbol}:`, {
        totalCanceled: summary.canceledOrders + summary.canceledOCOs,
        totalFailed: summary.failedOrders + summary.failedOCOs,
        successRate: `${Math.round(((summary.canceledOrders + summary.canceledOCOs) / (summary.totalOrders + summary.totalOCOs)) * 100)}%`,
      });
    }

    return createSuccessResponse({
      message: `Canceled ${summary.canceledOrders + summary.canceledOCOs} of ${summary.totalOrders + summary.totalOCOs} orders for ${symbol}`,
      summary,
    });
  } catch (error) {
    console.error("[Admin Cleanup] Fatal error:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return createErrorResponse(error);
  }
}

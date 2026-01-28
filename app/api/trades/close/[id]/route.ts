import { NextRequest, NextResponse } from "next/server";
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
import { serializeResponse } from "@/lib/utils/serialize";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    if (!id || !Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Valid trade ID is required", statusCode: 400 },
        },
        { status: 400 }
      );
    }

    await connectDB();

    const trade = await Trade.findById(id);
    if (!trade) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Trade not found", statusCode: 404 },
        },
        { status: 404 }
      );
    }

    if (trade.userId.toString() !== (user._id as Types.ObjectId).toString()) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Unauthorized access to trade", statusCode: 403 },
        },
        { status: 403 }
      );
    }

    if (trade.status !== "open" && trade.status !== "partial") {
      return NextResponse.json(
        {
          success: false,
          error: { message: `Cannot close trade with status '${trade.status}'`, statusCode: 400 },
        },
        { status: 400 }
      );
    }

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

    // Use helper function for consistent testnet preference resolution
    const useTestnet = resolveTestnetPreference(apiKeys);

    const apiKey = decrypt(apiKeys.encryptedApiKey as string);
    const apiSecret = decrypt(apiKeys.encryptedApiSecret as string);
    const client = new BinanceClient({ apiKey, apiSecret, testnet: useTestnet });

    await client.syncServerTime();

    const openOrders = await client.getOpenOrders(trade.symbol);
    const tradeOrders = openOrders.filter((order) =>
      trade.sellOrders.some((sellOrder: { orderId: number }) => sellOrder.orderId === order.orderId)
    );

    // PERF: Parallel order cancellations instead of sequential
    const cancellationResults = await Promise.allSettled(
      tradeOrders.map((order) => client.cancelOrder(trade.symbol, order.orderId))
    );

    // Log any cancellation failures
    cancellationResults.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(`Failed to cancel order ${tradeOrders[index].orderId}:`, result.reason);
      }
    });

    // PERF: Parallel fetch of account info and ticker data with error resilience
    const [accountResult, tickerResult] = await Promise.allSettled([
      client.getAccount(),
      client.get24hrTicker(trade.symbol),
    ]);

    // Handle API failures gracefully
    if (accountResult.status === "rejected") {
      console.error("Failed to fetch account balance:", accountResult.reason);
      return NextResponse.json(
        {
          success: false,
          error: { message: "Failed to fetch account balance from Binance", statusCode: 502 },
        },
        { status: 502 }
      );
    }

    if (tickerResult.status === "rejected") {
      console.error("Failed to fetch ticker data:", tickerResult.reason);
      return NextResponse.json(
        {
          success: false,
          error: { message: "Failed to fetch price data from Binance", statusCode: 502 },
        },
        { status: 502 }
      );
    }

    const accountInfo = accountResult.value;
    const tickerData = tickerResult.value;
    const balance = accountInfo.balances.find((b) => b.asset === trade.symbol.replace("USDT", ""));
    const availableQty = parseFloat(balance?.free || "0");

    let marketSellOrder;
    if (availableQty > 0) {
      try {
        // Use pre-fetched ticker data
        const currentPrice = parseFloat(tickerData.lastPrice);
        const quoteAmount = availableQty * currentPrice;

        if (quoteAmount >= 10) {
          const exchangeInfo = await client.getExchangeInfo(trade.symbol);
          const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === trade.symbol);

          if (symbolInfo) {
            const lotSizeFilter = symbolInfo.filters.find(
              (f): f is { filterType: "LOT_SIZE"; stepSize: string } =>
                f.filterType === "LOT_SIZE" && "stepSize" in f
            );
            const stepSize = parseFloat(lotSizeFilter?.stepSize || "0.00000001");
            const adjustedQty = Math.floor(availableQty / stepSize) * stepSize;

            if (adjustedQty > 0) {
              marketSellOrder = await client.createMarketSellOrder(trade.symbol, adjustedQty);
            }
          }
        }
      } catch (error) {
        console.error("Failed to create market sell order:", error);
      }
    }

    // Get actual buy cost from Binance (what was actually spent)
    const buyCost = trade.buyOrder.cummulativeQuoteQty;

    let exitPrice: number;
    let sellRevenue: number;

    if (marketSellOrder) {
      // If we executed a market sell, use actual sell revenue from Binance
      const sellOrderExecutedQty = parseFloat(marketSellOrder.executedQty || "0");
      const sellOrderPrice = parseFloat(marketSellOrder.fills?.[0]?.price || "0");
      sellRevenue = parseFloat(marketSellOrder.cummulativeQuoteQty || "0");
      exitPrice = sellOrderExecutedQty > 0 ? sellRevenue / sellOrderExecutedQty : sellOrderPrice;

      trade.sellOrders.push({
        orderId: marketSellOrder.orderId,
        symbol: marketSellOrder.symbol,
        side: "SELL" as const,
        type: "MARKET" as const,
        quantity: sellOrderExecutedQty,
        price: sellOrderPrice,
        executedQty: sellOrderExecutedQty,
        cummulativeQuoteQty: sellRevenue,
        status: marketSellOrder.status,
        timestamp: new Date(marketSellOrder.transactTime || Date.now()),
      });
    } else {
      // If no market sell (all positions already sold via OCO), use pre-fetched ticker price as estimate
      exitPrice = parseFloat(tickerData.lastPrice);
      // Estimate revenue based on remaining quantity at current price
      sellRevenue = exitPrice * trade.quantity;
    }

    // FIX: Realized P&L = Sell Revenue - Buy Cost (both from Binance API, not user input)
    const realizedPnL = sellRevenue - buyCost;

    trade.exitPrice = exitPrice;
    trade.realizedPnL = realizedPnL;
    trade.status = "closed";
    trade.closeReason = "manual";
    trade.closeReasonDetail = "Manual Close";

    // Update signal status when trade is manually closed
    if (trade.signalId) {
      await markSignalCompleted(trade.signalId, trade._id, "manual_close");
    }

    await trade.save();

    // Serialize MongoDB ObjectIds to strings (prevents [object Object] in URLs)
    return NextResponse.json(
      {
        success: true,
        data: serializeResponse({
          tradeId: trade._id,
          status: trade.status,
          exitPrice: trade.exitPrice,
          realizedPnL: trade.realizedPnL,
          closeReason: trade.closeReason,
          cancelledOrders: tradeOrders.length,
          marketSellExecuted: !!marketSellOrder,
        }),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("POST /api/trades/close/[id] error:", error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}

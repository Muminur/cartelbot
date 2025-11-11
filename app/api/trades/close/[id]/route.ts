import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Trade } from "@/lib/db/models";
import { getUserApiKeys } from "@/lib/db/helpers";
import { decrypt } from "@/lib/encryption";
import { BinanceClient } from "@/lib/binance/client";
import { formatErrorResponse } from "@/lib/utils/errors";
import { Types } from "mongoose";

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

    const body = await request.json();
    const { testnet = false } = body;

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

    const apiKey = decrypt(apiKeys.encryptedApiKey as string);
    const apiSecret = decrypt(apiKeys.encryptedApiSecret as string);
    const client = new BinanceClient({ apiKey, apiSecret, testnet });

    await client.syncServerTime();

    const openOrders = await client.getOpenOrders(trade.symbol);
    const tradeOrders = openOrders.filter((order) =>
      trade.sellOrders.some((sellOrder: { orderId: number }) => sellOrder.orderId === order.orderId)
    );

    for (const order of tradeOrders) {
      try {
        await client.cancelOrder(trade.symbol, order.orderId);
      } catch (error) {
        console.error(`Failed to cancel order ${order.orderId}:`, error);
      }
    }

    const accountInfo = await client.getAccount();
    const balance = accountInfo.balances.find((b) => b.asset === trade.symbol.replace("USDT", ""));
    const availableQty = parseFloat(balance?.free || "0");

    let marketSellOrder;
    if (availableQty > 0) {
      try {
        const ticker = await client.get24hrTicker(trade.symbol);
        const currentPrice = parseFloat(ticker.lastPrice);
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

    const ticker = await client.get24hrTicker(trade.symbol);
    const exitPrice = parseFloat(ticker.lastPrice);
    const realizedPnL = exitPrice * trade.quantity - trade.investedAmount;

    trade.exitPrice = exitPrice;
    trade.realizedPnL = realizedPnL;
    trade.status = "closed";
    trade.closeReason = "manual";

    if (marketSellOrder) {
      const sellOrderExecutedQty = parseFloat(marketSellOrder.executedQty || "0");
      const sellOrderPrice = parseFloat(marketSellOrder.fills?.[0]?.price || exitPrice.toString());

      trade.sellOrders.push({
        orderId: marketSellOrder.orderId,
        symbol: marketSellOrder.symbol,
        side: "SELL" as const,
        type: "MARKET" as const,
        quantity: sellOrderExecutedQty,
        price: sellOrderPrice,
        executedQty: sellOrderExecutedQty,
        cummulativeQuoteQty: parseFloat(marketSellOrder.cummulativeQuoteQty || "0"),
        status: marketSellOrder.status,
        timestamp: new Date(marketSellOrder.transactTime || Date.now()),
      });
    }

    await trade.save();

    return NextResponse.json(
      {
        success: true,
        data: {
          tradeId: trade._id,
          status: trade.status,
          exitPrice: trade.exitPrice,
          realizedPnL: trade.realizedPnL,
          closeReason: trade.closeReason,
          cancelledOrders: tradeOrders.length,
          marketSellExecuted: !!marketSellOrder,
        },
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

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Trade, Signal } from "@/lib/db/models";
import { getUserApiKeys } from "@/lib/db/helpers";
import { decrypt } from "@/lib/encryption";
import { BinanceClient } from "@/lib/binance/client";
import { validateAllFilters } from "@/lib/binance/filters";
import { formatErrorResponse } from "@/lib/utils/errors";
import { Types } from "mongoose";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();

    const { tradeId, approved, testnet: testnetParam } = body;

    // Use testnet parameter if provided, otherwise use user preference
    const testnet = testnetParam ?? user.useTestnet ?? false;

    if (!tradeId || !Types.ObjectId.isValid(tradeId)) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Valid trade ID is required", statusCode: 400 },
        },
        { status: 400 }
      );
    }

    if (typeof approved !== "boolean") {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Approval decision (true/false) is required", statusCode: 400 },
        },
        { status: 400 }
      );
    }

    await connectDB();

    const trade = await Trade.findById(tradeId);
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

    if (trade.status !== "pending_approval") {
      return NextResponse.json(
        {
          success: false,
          error: { message: `Trade status must be 'pending_approval', got '${trade.status}'`, statusCode: 400 },
        },
        { status: 400 }
      );
    }

    if (!approved) {
      trade.status = "cancelled";
      trade.approvalStatus = "rejected";
      trade.approvedAt = new Date();
      trade.approvedBy = (user._id as Types.ObjectId).toString();
      trade.closeReason = "cancelled";
      await trade.save();

      await Signal.findByIdAndUpdate(trade.signalId, { status: "cancelled" });

      return NextResponse.json({
        success: true,
        data: {
          tradeId: trade._id,
          status: trade.status,
          approvalStatus: trade.approvalStatus,
        },
      });
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

    const apiKey = decrypt(apiKeys.encryptedApiKey as string);
    const apiSecret = decrypt(apiKeys.encryptedApiSecret as string);
    const client = new BinanceClient({ apiKey, apiSecret, testnet });

    await client.syncServerTime();

    const exchangeInfo = await client.getExchangeInfo(trade.symbol);
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === trade.symbol);

    if (!symbolInfo || symbolInfo.status !== "TRADING") {
      return NextResponse.json(
        {
          success: false,
          error: { message: `Symbol ${trade.symbol} is not available for trading`, statusCode: 400 },
        },
        { status: 400 }
      );
    }

    const ticker = await client.get24hrTicker(trade.symbol);
    const currentPrice = parseFloat(ticker.lastPrice);
    const estimatedQuantity = trade.investedAmount / currentPrice;

    const validation = validateAllFilters(currentPrice, estimatedQuantity, symbolInfo.filters);
    if (!validation.isValid) {
      return NextResponse.json(
        {
          success: false,
          error: { message: `Filter validation failed: ${validation.errors.join(", ")}`, statusCode: 400 },
        },
        { status: 400 }
      );
    }

    const buyOrder = await client.createMarketBuyOrder(trade.symbol, trade.investedAmount);

    const executedQty = parseFloat(buyOrder.executedQty || "0");
    const executedPrice = parseFloat(buyOrder.fills?.[0]?.price || "0");

    trade.buyOrder = {
      orderId: buyOrder.orderId,
      symbol: buyOrder.symbol,
      side: "BUY" as const,
      type: "MARKET" as const,
      quantity: executedQty,
      price: executedPrice,
      executedQty,
      cummulativeQuoteQty: parseFloat(buyOrder.cummulativeQuoteQty || "0"),
      status: buyOrder.status,
      timestamp: new Date(buyOrder.transactTime || Date.now()),
    };
    trade.entryPrice = executedPrice;
    trade.quantity = executedQty;
    trade.status = "open";
    trade.approvalStatus = "approved";
    trade.approvedAt = new Date();
    trade.approvedBy = (user._id as Types.ObjectId).toString();

    await trade.save();

    await Signal.findByIdAndUpdate(trade.signalId, { status: "completed" });

    return NextResponse.json(
      {
        success: true,
        data: {
          tradeId: trade._id,
          buyOrder: trade.buyOrder,
          status: trade.status,
          approvalStatus: trade.approvalStatus,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("POST /api/trades/approve error:", error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}

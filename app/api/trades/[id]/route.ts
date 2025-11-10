import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Trade } from "@/lib/db/models";
import { getUserApiKeys } from "@/lib/db/helpers";
import { decrypt } from "@/lib/encryption";
import { BinanceClient } from "@/lib/binance";
import { formatErrorResponse } from "@/lib/utils/errors";
import { Types } from "mongoose";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const user = await requireAuth();
    await connectDB();

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Invalid trade ID", statusCode: 400 },
        },
        { status: 400 }
      );
    }

    const trade = await Trade.findOne({
      _id: id,
      userId: user._id,
    }).populate("signalId", "symbol entries targets stopLoss rawSignal");

    if (!trade) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Trade not found", statusCode: 404 },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: trade,
    });
  } catch (error) {
    console.error("GET /api/trades/[id] error:", error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const user = await requireAuth();
    await connectDB();

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Invalid trade ID", statusCode: 400 },
        },
        { status: 400 }
      );
    }

    const trade = await Trade.findOne({
      _id: id,
      userId: user._id,
    });

    if (!trade) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Trade not found", statusCode: 404 },
        },
        { status: 404 }
      );
    }

    if (trade.status === "closed" || trade.status === "cancelled") {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Trade already closed or cancelled", statusCode: 400 },
        },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const testnet = searchParams.get("testnet") === "true";

    const apiKeys = await getUserApiKeys(user._id as any);
    if (!apiKeys || !("encryptedApiKey" in apiKeys) || !("encryptedApiSecret" in apiKeys) || !apiKeys.encryptedApiKey || !apiKeys.encryptedApiSecret) {
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

    const openOrders = await client.getOpenOrders(trade.symbol);
    const cancelledOrders = [];

    for (const order of openOrders) {
      if (order.orderId) {
        try {
          const cancelled = await client.cancelOrder(trade.symbol, order.orderId);
          cancelledOrders.push(cancelled);
        } catch (error) {
          console.error(`Failed to cancel order ${order.orderId}:`, error);
        }
      }
    }

    trade.status = "cancelled";
    await trade.save();

    return NextResponse.json({
      success: true,
      data: {
        trade,
        cancelledOrders,
      },
    });
  } catch (error) {
    console.error("DELETE /api/trades/[id] error:", error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}

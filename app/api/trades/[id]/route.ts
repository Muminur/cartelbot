import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Trade } from "@/lib/db/models";
import { getUserApiKeys } from "@/lib/db/helpers";
import { decrypt } from "@/lib/encryption";
import { BinanceClient } from "@/lib/binance";
import { resolveTestnetPreference } from "@/lib/binance/helpers";
import { formatErrorResponse } from "@/lib/utils/errors";
import { serializeDocument } from "@/lib/utils/serialize";
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
    }).populate("signalId", "symbol entries targets stopLoss rawSignal").lean();

    if (!trade) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Trade not found", statusCode: 404 },
        },
        { status: 404 }
      );
    }

    // Serialize MongoDB ObjectIds to strings (prevents [object Object] in URLs)
    return NextResponse.json({
      success: true,
      data: serializeDocument(trade),
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

    const apiKeys = await getUserApiKeys(user._id);
    if (!apiKeys || !("encryptedApiKey" in apiKeys) || !("encryptedApiSecret" in apiKeys) || !apiKeys.encryptedApiKey || !apiKeys.encryptedApiSecret) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Binance API keys not configured", statusCode: 400 },
        },
        { status: 400 }
      );
    }

    // Use helper function for consistent testnet preference resolution
    const { searchParams } = new URL(request.url);
    const testnetParam = searchParams.get("testnet");
    const useTestnet = resolveTestnetPreference(apiKeys, testnetParam);

    const apiKey = decrypt(apiKeys.encryptedApiKey as string);
    const apiSecret = decrypt(apiKeys.encryptedApiSecret as string);
    const client = new BinanceClient({ apiKey, apiSecret, testnet: useTestnet });

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

    // Serialize MongoDB ObjectIds to strings (prevents [object Object] in URLs)
    return NextResponse.json({
      success: true,
      data: {
        trade: serializeDocument(trade),
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

import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { OrphanedCoin } from "@/lib/db/models/OrphanedCoin";
import { Trade } from "@/lib/db/models/Trade";
import { User } from "@/lib/db/models/User";
import { BinanceClient } from "@/lib/binance";
import { decrypt } from "@/lib/encryption";
import { BinanceAPIError } from "@/lib/utils/errors";
import { APIResponse } from "@/types";

interface SellOrphanedCoinResponse {
  success: boolean;
  message: string;
  orderId: number;
  executedQty: string;
  soldValue: number;
  realizedPnL: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<APIResponse<SellOrphanedCoinResponse>>> {
  try {
    const { id: orphanedCoinId } = await params;

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

    console.log(`[Sell Orphaned Coin] User ${user.email} selling coin ${orphanedCoinId}`);

    // 2. Connect to database
    await connectDB();

    // 3. Get orphaned coin and verify ownership
    const orphanedCoin = await OrphanedCoin.findById(orphanedCoinId);

    if (!orphanedCoin) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Orphaned coin not found",
            code: "COIN_NOT_FOUND",
            statusCode: 404,
          },
        },
        { status: 404 }
      );
    }

    if (orphanedCoin.userId !== String(user._id)) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Unauthorized", code: "UNAUTHORIZED", statusCode: 403 },
        },
        { status: 403 }
      );
    }

    if (orphanedCoin.status !== "active") {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "This orphaned coin has already been sold",
            code: "ALREADY_SOLD",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    // 4. Get user's API keys
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

    // 5. Decrypt API keys and initialize Binance client
    const apiKey = decrypt(userWithKeys.encryptedApiKey);
    const apiSecret = decrypt(userWithKeys.encryptedApiSecret);
    const testnet = userWithKeys.useTestnet ?? false;

    console.log(
      `[Sell Orphaned Coin] Using ${testnet ? "testnet" : "mainnet"} for ${orphanedCoin.symbol}`
    );

    const binanceClient = new BinanceClient({
      apiKey,
      apiSecret,
      testnet,
    });

    // 6. Execute market sell order
    try {
      const sellOrderResponse = await binanceClient.createMarketSellOrder(
        orphanedCoin.symbol,
        orphanedCoin.quantity
      );

      console.log(`[Sell Orphaned Coin] Sold ${orphanedCoin.quantity} ${orphanedCoin.symbol}`, {
        orderId: sellOrderResponse.orderId,
        executedQty: sellOrderResponse.executedQty,
      });

      // 7. Calculate P&L
      const soldValue = parseFloat(sellOrderResponse.cummulativeQuoteQty || "0");
      const investedAmount = orphanedCoin.buyPrice * orphanedCoin.quantity;
      const realizedPnL = soldValue - investedAmount;

      // 8. Update orphaned coin status
      orphanedCoin.status = "sold";
      await orphanedCoin.save();

      // 9. Create a trade record for the sale
      await Trade.create({
        userId: String(user._id),
        signalId: orphanedCoin.signalId,
        symbol: orphanedCoin.symbol,
        buyOrder: {
          orderId: orphanedCoin.buyOrderId,
          symbol: orphanedCoin.symbol,
          side: "BUY",
          type: "MARKET",
          quantity: orphanedCoin.quantity,
          price: orphanedCoin.buyPrice,
          executedQty: orphanedCoin.quantity,
          cummulativeQuoteQty: investedAmount.toFixed(2),
          status: "FILLED",
          timestamp: orphanedCoin.buyTimestamp,
        },
        sellOrders: [
          {
            orderId: sellOrderResponse.orderId,
            symbol: orphanedCoin.symbol,
            side: "SELL",
            type: "MARKET",
            quantity: parseFloat(sellOrderResponse.executedQty),
            executedQty: parseFloat(sellOrderResponse.executedQty),
            cummulativeQuoteQty: parseFloat(sellOrderResponse.cummulativeQuoteQty),
            status: sellOrderResponse.status,
            timestamp: new Date(sellOrderResponse.transactTime),
          },
        ],
        entryPrice: orphanedCoin.buyPrice,
        exitPrice: parseFloat(sellOrderResponse.fills?.[0]?.price || "0"),
        quantity: orphanedCoin.quantity,
        investedAmount,
        realizedPnL,
        status: "closed",
        closeReason: "manual",
      });

      return NextResponse.json({
        success: true,
        data: {
          success: true,
          message: `Successfully sold ${orphanedCoin.quantity} ${orphanedCoin.symbol}`,
          orderId: sellOrderResponse.orderId,
          executedQty: sellOrderResponse.executedQty,
          soldValue,
          realizedPnL,
        },
      });
    } catch (error) {
      console.error(`[Sell Orphaned Coin] Error executing sell order:`, {
        error: error instanceof Error ? error.message : String(error),
        binanceCode:
          error instanceof BinanceAPIError ? error.binanceCode : undefined,
      });

      // Handle specific Binance errors
      if (error instanceof BinanceAPIError) {
        let errorMessage = error.message;

        if (error.binanceCode === -2010) {
          errorMessage = "Insufficient balance to execute this order";
        } else if (error.binanceCode === -1013) {
          errorMessage = "Invalid quantity or price precision";
        }

        return NextResponse.json(
          {
            success: false,
            error: {
              message: errorMessage,
              code: "BINANCE_ERROR",
              statusCode: 400,
            },
          },
          { status: 400 }
        );
      }

      throw error;
    }
  } catch (error) {
    console.error("[Sell Orphaned Coin] Error:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          message:
            error instanceof Error ? error.message : "Failed to sell orphaned coin",
          code: "SELL_ORPHANED_COIN_ERROR",
          statusCode: 500,
        },
      },
      { status: 500 }
    );
  }
}

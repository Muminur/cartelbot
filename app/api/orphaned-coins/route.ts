import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { OrphanedCoin } from "@/lib/db/models/OrphanedCoin";
import { BinanceClient } from "@/lib/binance";
import { User } from "@/lib/db/models/User";
import { decrypt } from "@/lib/encryption";
import { APIResponse } from "@/types";

interface OrphanedCoinWithPrice {
  _id: string;
  symbol: string;
  quantity: number;
  buyPrice: number;
  buyOrderId: number;
  buyTimestamp: Date;
  currentMarketPrice: number;
  pnlPercentage: number;
  status: "active" | "sold" | "expired";
  createdAt: Date;
}

export async function GET(
  request: NextRequest
): Promise<NextResponse<APIResponse<OrphanedCoinWithPrice[]>>> {
  try {
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

    console.log(`[Orphaned Coins] Fetching for user ${user.email}`);

    // 2. Connect to database
    await connectDB();

    // 3. Get user's API keys
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

    // 4. Get orphaned coins for user
    const orphanedCoins = await OrphanedCoin.find({
      userId: String(user._id),
      status: "active",
    }).sort({ createdAt: -1 });

    if (orphanedCoins.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    // 5. Decrypt API keys and initialize Binance client
    const apiKey = decrypt(userWithKeys.encryptedApiKey);
    const apiSecret = decrypt(userWithKeys.encryptedApiSecret);
    const testnet = userWithKeys.useTestnet ?? false;

    const binanceClient = new BinanceClient({
      apiKey,
      apiSecret,
      testnet,
    });

    // 6. Fetch current prices for all symbols
    const coinsWithPrices: OrphanedCoinWithPrice[] = [];

    for (const coin of orphanedCoins) {
      try {
        const ticker = await binanceClient.get24hrTicker(coin.symbol);
        const currentPrice = parseFloat(ticker.lastPrice);
        const pnlPercentage = ((currentPrice - coin.buyPrice) / coin.buyPrice) * 100;

        // Update current market price in database
        coin.currentMarketPrice = currentPrice;
        await coin.save();

        coinsWithPrices.push({
          _id: String(coin._id),
          symbol: coin.symbol,
          quantity: coin.quantity,
          buyPrice: coin.buyPrice,
          buyOrderId: coin.buyOrderId,
          buyTimestamp: coin.buyTimestamp,
          currentMarketPrice: currentPrice,
          pnlPercentage,
          status: coin.status,
          createdAt: coin.createdAt,
        });
      } catch (error) {
        console.error(`[Orphaned Coins] Error fetching price for ${coin.symbol}:`, {
          error: error instanceof Error ? error.message : String(error),
        });

        // Include coin without current price
        coinsWithPrices.push({
          _id: String(coin._id),
          symbol: coin.symbol,
          quantity: coin.quantity,
          buyPrice: coin.buyPrice,
          buyOrderId: coin.buyOrderId,
          buyTimestamp: coin.buyTimestamp,
          currentMarketPrice: coin.currentMarketPrice || 0,
          pnlPercentage: 0,
          status: coin.status,
          createdAt: coin.createdAt,
        });
      }
    }

    console.log(`[Orphaned Coins] Found ${coinsWithPrices.length} orphaned coins`);

    return NextResponse.json({
      success: true,
      data: coinsWithPrices,
    });
  } catch (error) {
    console.error("[Orphaned Coins] Error:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : "Failed to fetch orphaned coins",
          code: "FETCH_ORPHANED_COINS_ERROR",
          statusCode: 500,
        },
      },
      { status: 500 }
    );
  }
}

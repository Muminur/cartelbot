import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { connectDB } from "@/lib/db/connection";
import { User } from "@/lib/db/models/User";
import { decrypt } from "@/lib/encryption";
import { BinanceClient } from "@/lib/binance";

/**
 * POST /api/user/test-connection
 * Tests Binance API connection with user's stored API keys
 */
export async function POST(request: NextRequest) {
  try {
    const { user, error } = await getUserFromRequest(request);
    if (error || !user) {
      return NextResponse.json(
        { success: false, error: error || "Unauthorized" },
        { status: 401 }
      );
    }

    await connectDB();

    // Fetch user with encrypted API keys
    const userDoc = await User.findOne({ email: user.email }).select(
      "+encryptedApiKey +encryptedApiSecret"
    );

    if (!userDoc) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    if (!userDoc.encryptedApiKey || !userDoc.encryptedApiSecret) {
      return NextResponse.json(
        {
          success: false,
          error: "API keys not configured. Please add your Binance API keys first.",
        },
        { status: 400 }
      );
    }

    // Decrypt API keys
    let apiKey: string;
    let apiSecret: string;

    try {
      apiKey = decrypt(userDoc.encryptedApiKey);
      apiSecret = decrypt(userDoc.encryptedApiSecret);
    } catch (decryptError) {
      console.error("Failed to decrypt API keys:", decryptError);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to decrypt API keys. Please re-enter your API keys.",
        },
        { status: 500 }
      );
    }

    // Test the connection with Binance
    const binanceClient = new BinanceClient({
      apiKey,
      apiSecret,
      testnet: false, // Use mainnet for testing
    });

    try {
      // Test the connection by fetching account info
      const accountInfo = await binanceClient.getAccount();

      // Calculate total balance in USDT (simplified - only counts USDT balance)
      const usdtBalance =
        accountInfo.balances.find((b: { asset: string; free: string }) => b.asset === "USDT")?.free || "0";

      const balances = accountInfo.balances
        .filter((b: { free: string; locked: string }) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
        .slice(0, 5) // Top 5 assets
        .map((b: { asset: string; free: string; locked: string }) => ({
          asset: b.asset,
          free: b.free,
          locked: b.locked,
        }));

      console.log(`API connection test successful for user ${user.email}`, {
        timestamp: new Date().toISOString(),
        canTrade: accountInfo.canTrade,
        balancesCount: balances.length,
      });

      return NextResponse.json({
        success: true,
        data: {
          message: "Connection successful",
          canTrade: accountInfo.canTrade,
          canWithdraw: accountInfo.canWithdraw,
          canDeposit: accountInfo.canDeposit,
          usdtBalance: parseFloat(usdtBalance),
          topBalances: balances,
          accountType: "SPOT", // Hardcoded as we only support spot trading
        },
      });
    } catch (binanceError) {
      console.error("Binance API connection test failed:", {
        error: binanceError,
        email: user.email,
        timestamp: new Date().toISOString(),
      });

      // Parse Binance error
      let errorMessage = "Failed to connect to Binance API";

      if (binanceError instanceof Error) {
        const errorMsg = binanceError.message.toLowerCase();

        if (errorMsg.includes("invalid api-key") || errorMsg.includes("api key")) {
          errorMessage =
            "Invalid API key. Please check your API key and try again.";
        } else if (errorMsg.includes("signature")) {
          errorMessage =
            "Invalid API secret. Please check your API secret and try again.";
        } else if (errorMsg.includes("timestamp")) {
          errorMessage =
            "Server time synchronization issue. Please try again in a moment.";
        } else if (errorMsg.includes("ip")) {
          errorMessage =
            "IP address not whitelisted. Please add your server IP to Binance API whitelist.";
        } else if (errorMsg.includes("banned")) {
          errorMessage = "API key has been banned or restricted.";
        } else if (errorMsg.includes("permission")) {
          errorMessage =
            "API key does not have required permissions. Please enable Spot & Margin Trading.";
        } else {
          errorMessage = `Binance API error: ${binanceError.message}`;
        }
      }

      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error testing Binance connection:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error while testing connection",
      },
      { status: 500 }
    );
  }
}

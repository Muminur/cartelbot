import { NextRequest, NextResponse } from "next/server";
import { BinanceClient } from "@/lib/binance";
import { formatErrorResponse, BinanceAPIError } from "@/lib/utils/errors";
import { getUserFromRequest } from "@/lib/auth";
import { connectDB } from "@/lib/db/connection";
import { User } from "@/lib/db/models/User";
import { resolveTestnetPreference } from "@/lib/binance/helpers";

export async function GET(request: NextRequest) {
  // Extract params outside try block for use in error messages
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const testnetParam = searchParams.get("testnet");

  try {
    if (!symbol) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Symbol is required", statusCode: 400 },
        },
        { status: 400 }
      );
    }

    // Fix #3: Add symbol format validation
    const SYMBOL_REGEX = /^[A-Z]{2,10}(USDT|BTC|ETH|BNB|BUSD)$/;
    if (!SYMBOL_REGEX.test(symbol.toUpperCase())) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_SYMBOL_FORMAT",
            message: "Symbol must match Binance format (e.g., BTCUSDT, ETHUSDT)",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    // Try to get authenticated user (optional for public endpoint)
    let useTestnet = false;

    try {
      const authResult = await getUserFromRequest(request);

      if (authResult.user) {
        // Authenticated: Use user's stored preference
        await connectDB();
        const dbUser = await User.findById(authResult.user._id).select("+binance.useTestnet");

        if (dbUser?.binance?.useTestnet !== undefined) {
          useTestnet = resolveTestnetPreference(
            { useTestnet: dbUser.binance.useTestnet },
            testnetParam
          );
        } else {
          // User exists but no preference stored, check URL param
          useTestnet = testnetParam === "true";
        }
      } else {
        // Unauthenticated: Use URL param or default to mainnet
        useTestnet = testnetParam === "true";
      }
    } catch (authError) {
      // Fix #5: Improve error logging with development-only output
      if (process.env.NODE_ENV === "development") {
        console.warn("[Ticker API] Authentication check failed, using mainnet:", {
          error: authError instanceof Error ? authError.message : String(authError),
          timestamp: new Date().toISOString(),
        });
      }
      // Authentication failed, fall back to URL param (public endpoint behavior)
      useTestnet = testnetParam === "true";
    }

    const client = new BinanceClient({
      apiKey: "",
      apiSecret: "",
      testnet: useTestnet,
    });

    const ticker = await client.get24hrTicker(symbol.toUpperCase());

    // Fix #2: Ensure network field is always included
    return NextResponse.json({
      success: true,
      data: {
        ...ticker,
        network: useTestnet ? "testnet" : "mainnet", // Always set network (Fix #2)
      } as const,
    });
  } catch (error) {
    // Handle invalid symbol error (code -1121) gracefully
    if (error instanceof BinanceAPIError && error.binanceCode === -1121) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_SYMBOL",
            message: `Trading pair ${symbol || "unknown"} not found on Binance`,
            binanceCode: -1121,
            statusCode: 404,
          },
        },
        { status: 404 }
      );
    }

    // Handle all other errors with standard error formatting
    console.error("GET /api/binance/ticker error:", error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}

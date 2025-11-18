import { NextRequest, NextResponse } from "next/server";
import { BinanceClient } from "@/lib/binance";
import { formatErrorResponse, BinanceAPIError } from "@/lib/utils/errors";
import { getUserFromRequest } from "@/lib/auth";
import { connectDB } from "@/lib/db/connection";
import { User } from "@/lib/db/models/User";
import { resolveTestnetPreference } from "@/lib/binance/helpers";

export async function GET(request: NextRequest) {
  // FIX BUG 4: Wrap ENTIRE function in try-catch to prevent any uncaught errors
  let symbol: string | null = null;
  let testnetParam: string | null = null;

  try {
    // Extract params (can throw if URL is malformed)
    const { searchParams } = new URL(request.url);
    symbol = searchParams.get("symbol");
    testnetParam = searchParams.get("testnet");

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

    // FIX BUG 4: Add validation that BinanceClient can be instantiated
    if (!BinanceClient) {
      throw new Error("BinanceClient not available");
    }

    const client = new BinanceClient({
      apiKey: "",
      apiSecret: "",
      testnet: useTestnet,
    });

    // FIX BUG 4: Validate client was created successfully
    if (!client || typeof client.get24hrTicker !== 'function') {
      throw new Error("Failed to initialize Binance client");
    }

    const ticker = await client.get24hrTicker(symbol.toUpperCase());

    // FIX BUG 4: Validate ticker response exists
    if (!ticker) {
      throw new Error("No ticker data returned from Binance");
    }

    // Fix #2: Ensure network field is always included
    return NextResponse.json({
      success: true,
      data: {
        ...ticker,
        price: ticker.lastPrice || ticker.price, // Alias for easier access with fallback
        network: useTestnet ? "testnet" : "mainnet", // Always set network (Fix #2)
      },
    });
  } catch (error) {
    // FIX BUG 4: Enhanced error handling with detailed logging
    console.error("[Ticker API] Error occurred:", {
      symbol,
      testnetParam,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    // Handle timeout errors specifically
    if (error instanceof Error && (
      error.message.includes('timeout') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('ECONNABORTED')
    )) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "TIMEOUT_ERROR",
            message: `Request to Binance API timed out for ${symbol}. The API may be experiencing high load or network issues.`,
            statusCode: 504,
            retry: true,
          },
        },
        { status: 504 }
      );
    }

    // Handle network connection errors
    if (error instanceof Error && error.message.includes('Network connection to Binance failed')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NETWORK_ERROR",
            message: error.message,
            statusCode: 503,
            retry: true,
          },
        },
        { status: 503 }
      );
    }

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

    // FIX BUG 4: Catch any other Binance API errors
    if (error instanceof BinanceAPIError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "BINANCE_API_ERROR",
            message: error.message,
            binanceCode: error.binanceCode,
            statusCode: error.statusCode || 500,
          },
        },
        { status: error.statusCode || 500 }
      );
    }

    // FIX BUG 4: Handle all other errors with guaranteed JSON response
    try {
      const errorResponse = formatErrorResponse(error);
      return NextResponse.json(
        { success: false, ...errorResponse },
        { status: errorResponse.error.statusCode }
      );
    } catch (formatError) {
      // FIX BUG 4: Last resort error handling if formatErrorResponse fails
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "An unexpected error occurred",
            statusCode: 500,
          },
        },
        { status: 500 }
      );
    }
  }
}

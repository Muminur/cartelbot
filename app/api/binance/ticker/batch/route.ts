import { NextRequest, NextResponse } from "next/server";
import { BinanceClient } from "@/lib/binance";
import { formatErrorResponse, BinanceAPIError } from "@/lib/utils/errors";
import { getUserFromRequest } from "@/lib/auth";
import { connectDB } from "@/lib/db/connection";
import { User } from "@/lib/db/models/User";
import { resolveTestnetPreference } from "@/lib/binance/helpers";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get("symbols");
  const testnetParam = searchParams.get("testnet");

  // Declare symbols at function scope for error logging
  let symbols: string[] = [];

  try {
    if (!symbolsParam) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Symbols parameter is required", statusCode: 400 },
        },
        { status: 400 }
      );
    }

    // Parse symbols array from JSON string
    try {
      symbols = JSON.parse(symbolsParam);

      if (!Array.isArray(symbols)) {
        throw new Error("Symbols must be an array");
      }

      if (symbols.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: { message: "Symbols array cannot be empty", statusCode: 400 },
          },
          { status: 400 }
        );
      }

      if (symbols.length > 100) {
        return NextResponse.json(
          {
            success: false,
            error: { message: "Maximum 100 symbols allowed per request", statusCode: 400 },
          },
          { status: 400 }
        );
      }

      // Validate symbol format
      const SYMBOL_REGEX = /^[A-Z]{2,10}(USDT|BTC|ETH|BNB|BUSD)$/;
      const invalidSymbols = symbols.filter(s => !SYMBOL_REGEX.test(s.toUpperCase()));

      if (invalidSymbols.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "INVALID_SYMBOL_FORMAT",
              message: `Invalid symbol format: ${invalidSymbols.join(", ")}`,
              statusCode: 400,
            },
          },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Invalid symbols parameter. Must be a JSON array of strings.",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    // Resolve testnet preference (same logic as single ticker endpoint)
    let useTestnet = false;

    try {
      const authResult = await getUserFromRequest(request);

      if (authResult.user) {
        await connectDB();
        const dbUser = await User.findById(authResult.user._id).select("+binance.useTestnet");

        if (dbUser?.binance?.useTestnet !== undefined) {
          useTestnet = resolveTestnetPreference(
            { useTestnet: dbUser.binance.useTestnet },
            testnetParam
          );
        } else {
          useTestnet = testnetParam === "true";
        }
      } else {
        useTestnet = testnetParam === "true";
      }
    } catch (authError) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[Batch Ticker API] Authentication check failed, using mainnet:", {
          error: authError instanceof Error ? authError.message : String(authError),
          timestamp: new Date().toISOString(),
        });
      }
      useTestnet = testnetParam === "true";
    }

    const client = new BinanceClient({
      apiKey: "",
      apiSecret: "",
      testnet: useTestnet,
    });

    // Uppercase all symbols
    const uppercaseSymbols = symbols.map(s => s.toUpperCase());

    const tickers = await client.getBatch24hrTicker(uppercaseSymbols);

    // Add network info and price alias to each ticker
    const enrichedTickers = tickers.map(ticker => ({
      ...ticker,
      price: ticker.lastPrice, // Alias for easier access
      network: useTestnet ? "testnet" : "mainnet",
    }));

    return NextResponse.json({
      success: true,
      data: enrichedTickers,
      meta: {
        count: enrichedTickers.length,
        requested: uppercaseSymbols.length,
        network: useTestnet ? "testnet" : "mainnet",
      },
    });
  } catch (error) {
    // Handle invalid symbol error gracefully
    if (error instanceof BinanceAPIError && error.binanceCode === -1121) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_SYMBOL",
            message: "One or more trading pairs not found on Binance",
            binanceCode: -1121,
            statusCode: 404,
          },
        },
        { status: 404 }
      );
    }

    // Handle network errors with specific messaging
    if (error instanceof Error) {
      const isNetworkError = error.message.includes('Network connection to Binance failed');
      if (isNetworkError) {
        console.error("GET /api/binance/ticker/batch - Network error after retries:", {
          message: error.message,
          timestamp: new Date().toISOString(),
          symbolCount: symbols?.length || 0,
        });

        return NextResponse.json(
          {
            success: false,
            error: {
              code: "NETWORK_ERROR",
              message: error.message,
              statusCode: 503,
              retry: true, // Indicate to frontend that retry is recommended
            },
          },
          { status: 503 }
        );
      }
    }

    console.error("GET /api/binance/ticker/batch error:", error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}

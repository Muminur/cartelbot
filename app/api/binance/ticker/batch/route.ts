import { NextRequest, NextResponse } from "next/server";
import { BinanceClient } from "@/lib/binance";
import { formatErrorResponse, BinanceAPIError } from "@/lib/utils/errors";
import { getUserFromRequest } from "@/lib/auth";
import { connectDB } from "@/lib/db/connection";
import { User } from "@/lib/db/models/User";
import { resolveTestnetPreference } from "@/lib/binance/helpers";
import { getCachedTicker, setCachedTicker } from "@/lib/binance/ticker-cache";

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
        return NextResponse.json(
          {
            success: false,
            error: { message: "Symbols parameter must be a JSON array", statusCode: 400 },
          },
          { status: 400 }
        );
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

      // Validate symbol format (BUSD deprecated Feb 2024, kept for legacy holdings)
      // Allow numbers in symbol names (e.g., 1INCH, API3, 1000SATS)
      const SYMBOL_REGEX = /^[A-Z0-9]{1,20}(USDT|BTC|ETH|BNB|BUSD)$/;
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

    // Uppercase all symbols
    const uppercaseSymbols = symbols.map(s => s.toUpperCase());

    // Check which symbols are already cached
    const cachedResults: any[] = [];
    const symbolsToFetch: string[] = [];
    const network = useTestnet ? 'testnet' : 'mainnet';

    for (const symbol of uppercaseSymbols) {
      const cached = getCachedTicker(symbol, network);
      if (cached) {
        cachedResults.push({ ...cached, cached: true });
      } else {
        symbolsToFetch.push(symbol);
      }
    }

    let freshResults: any[] = [];

    // Only fetch non-cached symbols from Binance
    if (symbolsToFetch.length > 0) {
      const client = new BinanceClient({
        apiKey: "",
        apiSecret: "",
        testnet: useTestnet,
      });

      const tickers = await client.getBatch24hrTicker(symbolsToFetch);

      // Add network info and price alias to each ticker, then cache
      freshResults = tickers.map(ticker => {
        const tickerData = {
          ...ticker,
          price: ticker.lastPrice, // Alias for easier access
          network: useTestnet ? "testnet" : "mainnet",
        };

        // Cache the result
        setCachedTicker(ticker.symbol, network, tickerData);

        return tickerData;
      });
    }

    // Combine cached and fresh results
    const allResults = [...cachedResults, ...freshResults];

    return NextResponse.json({
      success: true,
      data: allResults,
      meta: {
        count: allResults.length,
        requested: uppercaseSymbols.length,
        cached: cachedResults.length,
        fetched: freshResults.length,
        network: useTestnet ? "testnet" : "mainnet",
      },
    });
  } catch (error) {
    // Handle timeout errors specifically
    if (error instanceof Error && (
      error.message.includes('timeout') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('ECONNABORTED')
    )) {
      console.error("GET /api/binance/ticker/batch - Timeout error:", {
        message: error.message,
        timestamp: new Date().toISOString(),
        symbolCount: symbols?.length || 0,
      });

      return NextResponse.json(
        {
          success: false,
          error: {
            code: "TIMEOUT_ERROR",
            message: `Batch ticker request timed out for ${symbols?.length || 0} symbols. Binance API may be experiencing high load.`,
            statusCode: 504,
            retry: true,
          },
        },
        { status: 504 }
      );
    }

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

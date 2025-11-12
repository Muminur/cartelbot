import { NextRequest, NextResponse } from "next/server";
import { BinanceClient } from "@/lib/binance";
import { formatErrorResponse } from "@/lib/utils/errors";
import { env } from "@/lib/config/env";

export async function GET(request: NextRequest) {
  // Extract params outside try block for use in error messages
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const testnet = searchParams.get("testnet") === "true";

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

    const client = new BinanceClient({
      apiKey: "",
      apiSecret: "",
      testnet,
    });

    const ticker = await client.get24hrTicker(symbol.toUpperCase());

    return NextResponse.json({
      success: true,
      data: ticker,
    });
  } catch (error) {
    // Import BinanceAPIError type for instanceof check
    const { BinanceAPIError } = await import("@/lib/utils/errors");

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

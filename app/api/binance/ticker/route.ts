import { NextRequest, NextResponse } from "next/server";
import { BinanceClient } from "@/lib/binance";
import { formatErrorResponse } from "@/lib/utils/errors";
import { env } from "@/lib/config/env";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol");
    const testnet = searchParams.get("testnet") === "true";

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
    console.error("GET /api/binance/ticker error:", error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}

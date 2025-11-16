import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/config/env";

/**
 * GET /api/subscription/wallet
 * Returns the payment wallet address for subscription payments
 *
 * This endpoint is public (no authentication required) since users need
 * to see the wallet address before creating an account.
 */
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({
      success: true,
      data: {
        walletAddress: env.PAYMENT_WALLET_ADDRESS,
        network: "TRC20",
        currency: "USDT",
      },
    });
  } catch (error) {
    console.error("Failed to fetch wallet address:", error);

    return NextResponse.json(
      {
        success: false,
        error: {
          message: "Failed to fetch payment wallet address",
          code: "WALLET_FETCH_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

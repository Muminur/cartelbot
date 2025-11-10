import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getUserApiKeys } from "@/lib/db/helpers";
import { decrypt } from "@/lib/encryption";
import { BinanceClient } from "@/lib/binance";
import { formatErrorResponse } from "@/lib/utils/errors";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();

    const { searchParams } = new URL(request.url);
    const testnet = searchParams.get("testnet") === "true";

    const apiKeys = await getUserApiKeys(user._id as any);
    if (!apiKeys || !("encryptedApiKey" in apiKeys) || !("encryptedApiSecret" in apiKeys) || !apiKeys.encryptedApiKey || !apiKeys.encryptedApiSecret) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Binance API keys not configured", statusCode: 400 },
        },
        { status: 400 }
      );
    }

    const apiKey = decrypt(apiKeys.encryptedApiKey as string);
    const apiSecret = decrypt(apiKeys.encryptedApiSecret as string);

    const client = new BinanceClient({ apiKey, apiSecret, testnet });
    const account = await client.getAccount();

    return NextResponse.json({
      success: true,
      data: account,
    });
  } catch (error) {
    console.error("GET /api/binance/account error:", error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}

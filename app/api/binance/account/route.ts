import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getUserApiKeys } from "@/lib/db/helpers";
import { decrypt } from "@/lib/encryption";
import { BinanceClient } from "@/lib/binance";
import { formatErrorResponse, BinanceAPIError } from "@/lib/utils/errors";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();

    const { searchParams } = new URL(request.url);
    const testnetParam = searchParams.get("testnet");

    // Check if user has API keys configured BEFORE making Binance call
    const apiKeys = await getUserApiKeys(user._id as any);

    const hasKeys = apiKeys &&
                    "encryptedApiKey" in apiKeys &&
                    "encryptedApiSecret" in apiKeys &&
                    apiKeys.encryptedApiKey &&
                    apiKeys.encryptedApiSecret;

    if (!hasKeys) {
      if (process.env.NODE_ENV !== 'production') console.log(`User ${user.email} attempted to fetch account without API keys configured`, {
        timestamp: new Date().toISOString(),
        hasApiKeys: false,
      });

      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Please configure your Binance API keys in Settings to view your account balance.",
            code: "NO_API_KEYS",
            statusCode: 400,
            requiresSetup: true, // Flag for frontend to show setup prompt
          },
        },
        { status: 400 }
      );
    }

    // Decrypt API keys
    let apiKey: string;
    let apiSecret: string;

    try {
      apiKey = decrypt(apiKeys.encryptedApiKey as string);
      apiSecret = decrypt(apiKeys.encryptedApiSecret as string);
    } catch (decryptError) {
      console.error("Failed to decrypt API keys for user", {
        email: user.email,
        error: decryptError,
        timestamp: new Date().toISOString(),
      });

      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Failed to decrypt your API keys. Please re-enter your Binance API keys in Settings.",
            code: "DECRYPTION_ERROR",
            statusCode: 500,
            requiresSetup: true,
          },
        },
        { status: 500 }
      );
    }

    // Use testnet parameter if provided, otherwise use user preference
    const useTestnet = testnetParam === "true" || apiKeys.useTestnet || false;

    // Create Binance client and fetch account
    const client = new BinanceClient({ apiKey, apiSecret, testnet: useTestnet });

    try {
      const account = await client.getAccount();

      if (process.env.NODE_ENV !== 'production') console.log(`Successfully fetched account for user ${user.email}`, {
        timestamp: new Date().toISOString(),
        canTrade: account.canTrade,
        testnet: useTestnet,
      });

      return NextResponse.json({
        success: true,
        data: account,
      });
    } catch (binanceError) {
      // Handle Binance-specific errors with helpful messages
      console.error("Binance API error while fetching account:", {
        email: user.email,
        error: binanceError,
        testnet: useTestnet,
        timestamp: new Date().toISOString(),
      });

      // Parse Binance error code for specific guidance
      if (binanceError instanceof BinanceAPIError) {
        let userMessage = binanceError.message;
        let errorCode = "BINANCE_ERROR";

        switch (binanceError.binanceCode) {
          case -2015:
            userMessage = "Your API keys appear to be invalid or do not have the required permissions. Please check: (1) API key format is correct, (2) API secret is correct, (3) Your server IP is whitelisted on Binance, (4) Spot & Margin Trading permission is enabled.";
            errorCode = "INVALID_API_KEYS";
            break;
          case -2014:
            userMessage = "Invalid API key format. Please check your API key in Settings.";
            errorCode = "INVALID_KEY_FORMAT";
            break;
          case -1022:
            userMessage = "Invalid API signature. Please check your API secret in Settings.";
            errorCode = "INVALID_SIGNATURE";
            break;
          case -1021:
            userMessage = "Server time synchronization issue. Please try again in a moment.";
            errorCode = "TIMESTAMP_ERROR";
            break;
          default:
            userMessage = `Binance API error: ${binanceError.message}`;
        }

        return NextResponse.json(
          {
            success: false,
            error: {
              message: userMessage,
              code: errorCode,
              statusCode: 400,
              binanceCode: binanceError.binanceCode,
              requiresSetup: binanceError.binanceCode === -2015 || binanceError.binanceCode === -2014 || binanceError.binanceCode === -1022,
            },
          },
          { status: 400 }
        );
      }

      // Generic Binance error
      const errorResponse = formatErrorResponse(binanceError);
      return NextResponse.json(
        { success: false, ...errorResponse },
        { status: 400 } // Use 400 for Binance API errors (not server error)
      );
    }
  } catch (error) {
    // Catch-all for unexpected errors (auth errors, network errors, etc.)
    console.error("GET /api/binance/account unexpected error:", {
      error,
      timestamp: new Date().toISOString(),
    });

    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}

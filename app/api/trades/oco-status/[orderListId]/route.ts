import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { BinanceClient } from "@/lib/binance";
import { decrypt } from "@/lib/encryption";
import { connectDB } from "@/lib/db/connection";
import { User } from "@/lib/db/models/User";
import { Trade } from "@/lib/db/models/Trade";
import { BinanceAPIError } from "@/lib/utils/errors";

/**
 * GET /api/trades/oco-status/[orderListId]
 *
 * Fetch real-time OCO order status directly from Binance API
 *
 * Query params:
 * - testnet: "true" | "false" (optional, defaults to user preference)
 *
 * Returns:
 * - Binance OCO order status with listStatusType, listOrderStatus, and individual order details
 * - Shows actual execution status (FILLED/CANCELED/NEW) from Binance, not computed from prices
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderListId: string }> }
) {
  // Await params (Next.js 16 requirement)
  const { orderListId: orderListIdParam } = await params;

  // Declare useTestnet outside try block for error handler access
  let useTestnet = false;

  try {

    // 1. Authenticate user
    const authResult = await getUserFromRequest(request);
    if (!authResult.user) {
      return NextResponse.json(
        { success: false, error: { message: "Unauthorized" } },
        { status: 401 }
      );
    }

    // 2. Get user's API keys from database
    await connectDB();

    const dbUser = await User.findById(authResult.user._id).select(
      "+encryptedApiKey +encryptedApiSecret useTestnet"
    );

    if (!dbUser?.encryptedApiKey || !dbUser?.encryptedApiSecret) {
      console.error("[OCO Status API] 400 ERROR - API keys missing:", {
        userId: authResult.user._id,
        hasApiKey: !!dbUser?.encryptedApiKey,
        hasApiSecret: !!dbUser?.encryptedApiSecret,
        orderListId: orderListIdParam,
      });

      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Binance API keys not configured. Please add them in Settings.",
            code: "API_KEYS_MISSING",
          },
        },
        { status: 400 }
      );
    }

    // 3. Decrypt API keys
    let apiKey: string;
    let apiSecret: string;

    try {
      apiKey = decrypt(dbUser.encryptedApiKey);
      apiSecret = decrypt(dbUser.encryptedApiSecret);
    } catch (decryptError) {
      console.error("[OCO Status API] 400 ERROR - Decryption failed:", {
        error: decryptError instanceof Error ? decryptError.message : "Unknown error",
        userId: authResult.user._id,
        orderListId: orderListIdParam,
      });

      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Failed to decrypt API keys. Please re-save your keys in Settings.",
            code: "DECRYPTION_FAILED",
          },
        },
        { status: 400 }
      );
    }

    // 4. Validate orderListId parameter
    const orderListId = parseInt(orderListIdParam);

    if (
      isNaN(orderListId) ||
      orderListId <= 0 ||
      orderListId > Number.MAX_SAFE_INTEGER
    ) {
      console.error("[OCO Status API] 400 ERROR - Invalid orderListId:", {
        orderListIdParam,
        parsedValue: orderListId,
        isNaN: isNaN(orderListId),
        isNegative: orderListId <= 0,
        isTooLarge: orderListId > Number.MAX_SAFE_INTEGER,
        userId: authResult.user._id,
      });

      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Invalid orderListId. Must be a positive integer.",
            code: "INVALID_PARAMETER",
          },
        },
        { status: 400 }
      );
    }

    // 5. Verify user owns this OCO order (SECURITY: Authorization check)
    const trade = await Trade.findOne({
      userId: String(authResult.user._id),
      'sellOrders.orderListId': orderListId
    });

    if (!trade) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "OCO order not found or unauthorized",
            code: "UNAUTHORIZED",
          },
        },
        { status: 404 }
      );
    }

    // 6. Use trade's stored testnet preference (SECURITY: No URL override)
    useTestnet = trade.testnet || false;

    // 7. Initialize Binance client with correct network
    const binanceClient = new BinanceClient({
      apiKey,
      apiSecret,
      testnet: useTestnet,
    });

    // 8. Fetch OCO order status directly from Binance
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[OCO Status API] Fetching status for orderListId ${orderListId} from ${useTestnet ? "testnet" : "mainnet"}`,
        {
          userId: authResult.user._id,
          testnet: useTestnet,
        }
      );
    }

    const ocoStatus = await binanceClient.getOCOOrder(orderListId);

    if (process.env.NODE_ENV === "development") {
      console.log(
        `[OCO Status API] Success - listStatusType: ${ocoStatus.listStatusType}, listOrderStatus: ${ocoStatus.listOrderStatus}`
      );
    }

    // 8. Return real-time status from Binance
    return NextResponse.json({
      success: true,
      data: ocoStatus,
    });
  } catch (error: unknown) {
    console.error("[OCO Status API] Error fetching OCO status:", {
      error: error instanceof Error ? error.message : "Unknown error",
      orderListId: orderListIdParam,
    });

    // Handle Binance API errors specifically
    if (error instanceof BinanceAPIError) {
      if (error.binanceCode === -1013) {
        console.error("[OCO Status API] 400 ERROR - Binance -1013:", {
          binanceMessage: error.message,
          binanceCode: error.binanceCode,
          orderListId: orderListIdParam,
          testnet: useTestnet,
        });

        return NextResponse.json(
          {
            success: false,
            error: {
              message: "Invalid symbol or order parameters",
              code: "INVALID_SYMBOL",
              binanceCode: -1013,
            },
          },
          { status: 400 }
        );
      }

      if (error.binanceCode === -2013) {
        return NextResponse.json(
          {
            success: false,
            error: {
              message: `OCO order not found on Binance ${useTestnet ? 'Testnet' : 'Mainnet'}. The order may have been executed, canceled, expired, or archived (orders older than 90 days are removed from Binance API).`,
              code: "ORDER_NOT_FOUND",
              binanceCode: -2013,
              network: useTestnet ? 'testnet' : 'mainnet',
            },
          },
          { status: 404 }
        );
      }
    }

    // Generic error
    return NextResponse.json(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : "Failed to fetch OCO status",
          code: "FETCH_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

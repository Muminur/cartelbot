import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/middleware/admin-auth";
import { BinanceClient } from "@/lib/binance";
import { decrypt } from "@/lib/encryption";
import { connectDB } from "@/lib/db/connection";
import { User } from "@/lib/db/models/User";
import { Trade } from "@/lib/db/models/Trade";
import { BinanceAPIError } from "@/lib/utils/errors";

/**
 * GET /api/admin/oco-status/[orderListId]
 *
 * Admin-only endpoint to fetch OCO order status for ANY user's trade.
 * Uses the trade owner's API keys to query Binance.
 *
 * Security: Requires admin authentication, no ownership check on trade.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderListId: string }> }
) {
  // Await params (Next.js 16 requirement)
  const { orderListId: orderListIdParam } = await params;

  // 1. Verify admin authentication
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.response;

  // Declare useTestnet outside try block for error handler access
  let useTestnet = false;
  let userId: string | undefined;

  try {
    // 2. Validate orderListId parameter
    const orderListId = parseInt(orderListIdParam);

    if (
      isNaN(orderListId) ||
      orderListId <= 0 ||
      orderListId > Number.MAX_SAFE_INTEGER
    ) {
      if (process.env.NODE_ENV === "development") {
        console.error("[Admin OCO Status] 400 ERROR - Invalid orderListId:", {
          orderListIdParam,
          parsedValue: orderListId,
          isNaN: isNaN(orderListId),
          isNegative: orderListId <= 0,
          isTooLarge: orderListId > Number.MAX_SAFE_INTEGER,
        });
      }

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

    // 3. Find trade (NO ownership check - admin can view any trade)
    await connectDB();
    const trade = await Trade.findOne({
      'sellOrders.orderListId': orderListId
    });

    if (!trade) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Trade not found with this OCO order",
            code: "TRADE_NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    userId = trade.userId;
    useTestnet = trade.testnet || false;

    // 4. Get trade owner's API keys
    const tradeOwner = await User.findById(trade.userId).select(
      "+encryptedApiKey +encryptedApiSecret useTestnet"
    );

    if (!tradeOwner?.encryptedApiKey || !tradeOwner?.encryptedApiSecret) {
      if (process.env.NODE_ENV === "development") {
        console.error("[Admin OCO Status] 400 ERROR - API keys missing:", {
          userId: trade.userId,
          hasApiKey: !!tradeOwner?.encryptedApiKey,
          hasApiSecret: !!tradeOwner?.encryptedApiSecret,
          orderListId: orderListIdParam,
        });
      }

      return NextResponse.json(
        {
          success: false,
          error: {
            message: "User's Binance API keys not configured",
            code: "API_KEYS_MISSING",
          },
        },
        { status: 400 }
      );
    }

    // 5. Decrypt API keys
    let apiKey: string;
    let apiSecret: string;

    try {
      apiKey = decrypt(tradeOwner.encryptedApiKey);
      apiSecret = decrypt(tradeOwner.encryptedApiSecret);
    } catch (decryptError) {
      if (process.env.NODE_ENV === "development") {
        console.error("[Admin OCO Status] 400 ERROR - Decryption failed:", {
          error: decryptError instanceof Error ? decryptError.message : "Unknown error",
          userId: trade.userId,
          orderListId: orderListIdParam,
        });
      }

      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Failed to decrypt user's API keys",
            code: "DECRYPTION_FAILED",
          },
        },
        { status: 400 }
      );
    }

    // 6. Initialize Binance client with trade owner's credentials
    const binanceClient = new BinanceClient({
      apiKey,
      apiSecret,
      testnet: useTestnet,
    });

    // 7. Fetch OCO order status from Binance
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[Admin OCO Status] Fetching status for orderListId ${orderListId} from ${useTestnet ? "testnet" : "mainnet"}`,
        {
          adminEmail: adminCheck.user?.email,
          tradeUserId: trade.userId,
          testnet: useTestnet,
        }
      );
    }

    const ocoStatus = await binanceClient.getOCOOrder(orderListId);

    if (process.env.NODE_ENV === "development") {
      console.log(
        `[Admin OCO Status] Success - listStatusType: ${ocoStatus.listStatusType}, listOrderStatus: ${ocoStatus.listOrderStatus}`
      );
    }

    // 8. Return real-time status from Binance
    return NextResponse.json({
      success: true,
      data: ocoStatus,
    });
  } catch (error: unknown) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Admin OCO Status] Error fetching OCO status:", {
        error: error instanceof Error ? error.message : "Unknown error",
        orderListId: orderListIdParam,
        userId,
        testnet: useTestnet,
      });
    }

    // Handle Binance API errors specifically
    if (error instanceof BinanceAPIError) {
      if (error.binanceCode === -1013) {
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

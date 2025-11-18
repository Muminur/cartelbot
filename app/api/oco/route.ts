import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { connectDB } from "@/lib/db/connection";
import { getUserApiKeys } from "@/lib/db/helpers";
import { BinanceClient } from "@/lib/binance";
import { decrypt } from "@/lib/encryption";
import type { BinanceOCOResponse } from "@/types";

// C1: Simple in-memory cache layer (10-second TTL)
const ocoCache = new Map<
  string,
  { data: BinanceOCOResponse[]; timestamp: number }
>();
const CACHE_TTL = 10000; // 10 seconds

/**
 * Get cached OCO orders if still valid
 */
function getCachedOCO(cacheKey: string): BinanceOCOResponse[] | null {
  const cached = ocoCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

/**
 * Cache OCO orders with timestamp
 */
function setCachedOCO(cacheKey: string, data: BinanceOCOResponse[]): void {
  ocoCache.set(cacheKey, { data, timestamp: Date.now() });

  // Clean old cache entries to prevent memory leak
  if (ocoCache.size > 100) {
    const oldestKey = Array.from(ocoCache.keys())[0];
    if (oldestKey) {
      ocoCache.delete(oldestKey);
    }
  }
}

/**
 * C2: Sanitize error messages to prevent API key leakage
 */
function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Remove any potential API keys (32+ alphanumeric sequences)
    return error.message.replace(/[a-zA-Z0-9]{32,}/g, "[REDACTED]");
  }
  return "Failed to fetch OCO orders from Binance";
}

/**
 * GET /api/oco
 *
 * Fetch all user's OCO orders directly from Binance API (both mainnet and testnet)
 *
 * Query params:
 * - symbol: Filter by symbol (case-insensitive)
 * - status: Filter by status (all | EXECUTING | ALL_DONE | REJECT)
 * - network: Filter by network (all | mainnet | testnet)
 * - page: Page number (default 1)
 * - limit: Items per page (default 20)
 * - sortBy: Sort field (default "transactionTime")
 * - sortOrder: Sort order (asc | desc, default "desc")
 *
 * Returns:
 * - Array of OCO orders with details from Binance
 * - Pagination metadata
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate user
    const authResult = await getUserFromRequest(request);
    if (!authResult.user) {
      return NextResponse.json(
        { success: false, error: { message: "Unauthorized" } },
        { status: 401 }
      );
    }

    // 2. Connect to database and get user API keys
    await connectDB();

    const apiKeys = await getUserApiKeys(authResult.user._id);
    if (!apiKeys || !apiKeys.encryptedApiKey || !apiKeys.encryptedApiSecret) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "API keys not configured. Please add your Binance API keys in Settings.",
            code: "API_KEYS_MISSING",
          },
        },
        { status: 400 }
      );
    }

    // 3. Parse query parameters with H2: Input validation
    const { searchParams } = new URL(request.url);

    // Validate symbol (max 20 chars, alphanumeric only)
    const symbolRaw = searchParams.get("symbol") || "";
    const symbol = symbolRaw.trim().toUpperCase().slice(0, 20);

    // Validate status (whitelist)
    const validStatuses = ["all", "EXECUTING", "ALL_DONE", "REJECT"];
    const statusRaw = searchParams.get("status") || "all";
    const statusFilter = validStatuses.includes(statusRaw) ? statusRaw : "all";

    // Validate network (whitelist)
    const validNetworks = ["all", "mainnet", "testnet"];
    const networkRaw = searchParams.get("network") || "all";
    const network = validNetworks.includes(networkRaw) ? networkRaw : "all";

    // Validate pagination (bounds checking)
    const pageRaw = parseInt(searchParams.get("page") || "1");
    const page = Math.max(1, Math.min(1000, isNaN(pageRaw) ? 1 : pageRaw));

    const limitRaw = parseInt(searchParams.get("limit") || "20");
    const limit = Math.max(1, Math.min(100, isNaN(limitRaw) ? 20 : limitRaw));

    // Validate sortBy (whitelist)
    const validSortFields = ["transactionTime", "orderListId", "symbol"];
    const sortByRaw = searchParams.get("sortBy") || "transactionTime";
    const sortBy = validSortFields.includes(sortByRaw)
      ? sortByRaw
      : "transactionTime";

    // Validate sortOrder (whitelist)
    const sortOrderRaw = searchParams.get("sortOrder") || "desc";
    const sortOrder = sortOrderRaw === "asc" ? "asc" : "desc";

    // 4. Decrypt API keys with H1: Error handling
    let apiKey: string;
    let apiSecret: string;

    try {
      apiKey = decrypt(apiKeys.encryptedApiKey);
      apiSecret = decrypt(apiKeys.encryptedApiSecret);
    } catch (decryptError) {
      console.error("[OCO API] Decryption failed:", {
        userId: authResult.user._id,
        error:
          decryptError instanceof Error ? decryptError.message : "Unknown",
      });

      return NextResponse.json(
        {
          success: false,
          error: {
            message:
              "Failed to decrypt API keys. Please re-save your keys in Settings.",
            code: "DECRYPTION_FAILED",
          },
        },
        { status: 500 }
      );
    }

    // 5. Determine which networks to fetch from
    const fetchMainnet = network === "all" || network === "mainnet";
    const fetchTestnet = network === "all" || network === "testnet";

    // 6. Fetch OCO orders from Binance API with C1: Caching and H3: Failure tracking
    const allOcoOrders: Array<BinanceOCOResponse & { testnet: boolean }> = [];
    const failedNetworks: string[] = [];

    // Fetch from mainnet if needed
    if (fetchMainnet) {
      const mainnetCacheKey = `${authResult.user._id}_mainnet`;
      let mainnetOrders: BinanceOCOResponse[] = [];

      // Try to get from cache first
      const cachedMainnet = getCachedOCO(mainnetCacheKey);
      if (cachedMainnet) {
        mainnetOrders = cachedMainnet;
      } else {
        // Fetch from Binance if cache miss
        try {
          const mainnetClient = new BinanceClient({
            apiKey,
            apiSecret,
            testnet: false,
          });

          // Fetch all OCO orders from mainnet (limit 1000 to prevent huge responses)
          mainnetOrders = await mainnetClient.getAllOCOOrders({ limit: 1000 });

          // Cache the results
          setCachedOCO(mainnetCacheKey, mainnetOrders);
        } catch (error: unknown) {
          failedNetworks.push("mainnet");
          console.error("[OCO API] Error fetching mainnet OCO orders:", {
            error: error instanceof Error ? error.message : "Unknown error",
            userId: authResult.user._id,
          });
          // Continue execution - we'll still try to fetch testnet orders
        }
      }

      // Add testnet flag to each order
      mainnetOrders.forEach((order) => {
        allOcoOrders.push({ ...order, testnet: false });
      });
    }

    // Fetch from testnet if needed
    if (fetchTestnet) {
      const testnetCacheKey = `${authResult.user._id}_testnet`;
      let testnetOrders: BinanceOCOResponse[] = [];

      // Try to get from cache first
      const cachedTestnet = getCachedOCO(testnetCacheKey);
      if (cachedTestnet) {
        testnetOrders = cachedTestnet;
      } else {
        // Fetch from Binance if cache miss
        try {
          const testnetClient = new BinanceClient({
            apiKey,
            apiSecret,
            testnet: true,
          });

          // Fetch all OCO orders from testnet (limit 1000 to prevent huge responses)
          testnetOrders = await testnetClient.getAllOCOOrders({ limit: 1000 });

          // Cache the results
          setCachedOCO(testnetCacheKey, testnetOrders);
        } catch (error: unknown) {
          failedNetworks.push("testnet");
          console.error("[OCO API] Error fetching testnet OCO orders:", {
            error: error instanceof Error ? error.message : "Unknown error",
            userId: authResult.user._id,
          });
          // Continue execution - we'll return what we have
        }
      }

      // Add testnet flag to each order
      testnetOrders.forEach((order) => {
        allOcoOrders.push({ ...order, testnet: true });
      });
    }

    // H3: Check if both networks failed
    if (allOcoOrders.length === 0 && failedNetworks.length > 0) {
      const networkStr =
        network === "all" ? "both mainnet and testnet" : network;

      return NextResponse.json(
        {
          success: false,
          error: {
            message: `Failed to fetch OCO orders from ${networkStr}. Please try again later.`,
            code: "FETCH_FAILED",
            failedNetworks,
          },
        },
        { status: 502 } // Bad Gateway
      );
    }

    // 7. Apply filters
    let filteredOrders = allOcoOrders;

    // Filter by symbol (case-insensitive)
    if (symbol) {
      const symbolUpper = symbol.trim().toUpperCase();
      filteredOrders = filteredOrders.filter((order) =>
        order.symbol.toUpperCase().includes(symbolUpper)
      );
    }

    // Filter by status
    if (statusFilter !== "all") {
      filteredOrders = filteredOrders.filter(
        (order) => order.listOrderStatus === statusFilter
      );
    }

    // 8. Sort orders
    filteredOrders.sort((a, b) => {
      let aValue: number | string;
      let bValue: number | string;

      if (sortBy === "transactionTime") {
        aValue = a.transactionTime;
        bValue = b.transactionTime;
      } else if (sortBy === "orderListId") {
        aValue = a.orderListId;
        bValue = b.orderListId;
      } else if (sortBy === "symbol") {
        aValue = a.symbol;
        bValue = b.symbol;
      } else {
        // Default to transactionTime
        aValue = a.transactionTime;
        bValue = b.transactionTime;
      }

      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortOrder === "asc" ? aValue - bValue : bValue - aValue;
      } else {
        // String comparison
        const strA = String(aValue);
        const strB = String(bValue);
        return sortOrder === "asc"
          ? strA.localeCompare(strB)
          : strB.localeCompare(strA);
      }
    });

    // 9. Apply pagination
    const totalOrders = filteredOrders.length;
    const totalPages = Math.ceil(totalOrders / limit);
    const skip = Math.max(0, (page - 1) * limit);
    const paginatedOrders = filteredOrders.slice(skip, skip + limit);

    // 10. Transform to response format
    const transformedOrders = paginatedOrders.map((order) => {
      // Extract order details from orderReports
      const orders = order.orderReports?.map((report) => ({
        orderId: report.orderId,
        type: report.type,
        price: parseFloat(report.price),
        stopPrice: report.stopPrice ? parseFloat(report.stopPrice) : undefined,
        quantity: parseFloat(report.origQty),
        status: report.status,
        executedQty: parseFloat(report.executedQty),
      })) || [];

      return {
        orderListId: order.orderListId,
        symbol: order.symbol,
        orders,
        status: order.listOrderStatus,
        createdAt: new Date(order.transactionTime).toISOString(),
        testnet: order.testnet,
      };
    });

    // 11. Return response
    return NextResponse.json({
      success: true,
      data: transformedOrders,
      pagination: {
        page,
        limit,
        total: totalOrders,
        pages: totalPages,
        actualCount: transformedOrders.length,
      },
    });
  } catch (error: unknown) {
    console.error("[OCO API] Error fetching OCO orders from Binance:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          message: sanitizeErrorMessage(error), // C2: Sanitize error messages
          code: "FETCH_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { connectDB } from "@/lib/db/connection";
import { Trade } from "@/lib/db/models/Trade";
import type { ITrade, IOrder } from "@/types";
import { serializeResponse } from "@/lib/utils/serialize";

// Type for lean queries (no Mongoose Document methods)
type LeanTrade = {
  _id: string;
  symbol: string;
  sellOrders?: IOrder[];
  testnet?: boolean;
  createdAt?: Date;
};

/**
 * GET /api/oco - Fetch OCO orders from database (not Binance)
 *
 * Query parameters:
 * - symbol: Filter by symbol (optional)
 * - status: Filter by status (optional)
 * - network: Filter by network: mainnet, testnet, or all (default: all)
 * - page: Page number (default: 1)
 * - limit: Results per page (default: 20, max: 100)
 *
 * Returns OCO orders with orderReports from database Trade records
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // 1. Authenticate user
    const authResult = await getUserFromRequest(request);
    if (!authResult || !authResult.user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Unauthorized. Please log in to continue.",
            code: "UNAUTHORIZED",
          },
        },
        { status: 401 }
      );
    }

    const user = authResult.user;

    // C3: Validate user ID exists
    if (!user._id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Invalid user session",
            code: "INVALID_SESSION",
          },
        },
        { status: 401 }
      );
    }

    // 2. Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get("symbol") || "";
    const statusFilter = searchParams.get("status") || "all";
    const network = searchParams.get("network") || "all";

    const pageNum = parseInt(searchParams.get("page") || "1", 10);
    const limitNum = parseInt(searchParams.get("limit") || "20", 10);
    const page = isNaN(pageNum) ? 1 : Math.max(1, pageNum);
    const limit = isNaN(limitNum) ? 20 : Math.min(100, Math.max(1, limitNum));

    // 3. Connect to database
    await connectDB();

    // 4. Build query to fetch trades with OCO orders (sellOrders with orderListId)
    const query: Record<string, unknown> = {
      userId: String(user._id),
      "sellOrders.0": { $exists: true }, // Has at least one sell order
      "sellOrders.orderListId": { $exists: true }, // Has OCO orders
    };

    // C4: Filter by symbol with NoSQL injection protection
    if (symbol) {
      // Escape regex special characters
      const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      // Limit length to prevent ReDoS
      if (escapedSymbol.length > 20) {
        return NextResponse.json(
          {
            success: false,
            error: {
              message: "Symbol filter too long (max 20 characters)",
              code: "INVALID_SYMBOL_FILTER",
            },
          },
          { status: 400 }
        );
      }

      query.symbol = { $regex: `^${escapedSymbol}`, $options: "i" };
    }

    // Filter by network
    if (network === "mainnet") {
      query.testnet = false;
    } else if (network === "testnet") {
      query.testnet = true;
    }

    // 5. Fetch trades from database with timeout protection
    let tradesResult;
    try {
      tradesResult = await Trade.find(query)
        .select("symbol sellOrders testnet createdAt")
        .sort({ createdAt: -1 })
        .maxTimeMS(5000) // H4: 5-second timeout
        .lean()
        .exec();
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "MongoServerError") {
        const mongoError = error as { code?: number };
        if (mongoError.code === 50) {
          // MaxTimeMSExpired
          return NextResponse.json(
            {
              success: false,
              error: {
                message:
                  "Database query timeout. Please try a more specific filter.",
                code: "QUERY_TIMEOUT",
              },
            },
            { status: 504 }
          );
        }
      }
      throw error; // Re-throw other errors
    }

    // C2: Proper type casting for lean queries
    const trades = tradesResult as unknown as LeanTrade[];

    const queryTime = Date.now() - startTime;
    console.log(`[OCO API] Fetched ${trades.length} trades in ${queryTime}ms`, {
      userId: String(user._id),
      filters: { symbol, statusFilter, network },
      pagination: { page, limit },
    });

    // 6. Transform trades into OCO order format
    const allOCOOrders = trades.flatMap((trade: LeanTrade) => {
      // H1: Defensive check for corrupted data
      if (
        !Array.isArray(trade.sellOrders) ||
        trade.sellOrders.length === 0
      ) {
        return [];
      }

      // Group sell orders by orderListId
      const ocoGroups = new Map<number, IOrder[]>();

      trade.sellOrders.forEach((order: IOrder) => {
        // Check for orderListId (including 0, which is valid)
        if (order.orderListId !== undefined && order.orderListId !== null) {
          const existing = ocoGroups.get(order.orderListId);
          if (existing) {
            existing.push(order);
          } else {
            ocoGroups.set(order.orderListId, [order]);
          }
        }
      });

      // Create OCO order objects from grouped orders
      return Array.from(ocoGroups.entries()).map(([orderListId, orders]) => {
        // H1: Validate orders array
        if (orders.length === 0) {
          console.warn(
            `[OCO API] Empty orders array for orderListId ${orderListId}`
          );
        }

        // H2: Determine overall status based on individual order statuses (FIXED LOGIC)
        const statuses = orders.map((o: IOrder) => o.status);
        let listOrderStatus: string;

        // Check for rejection first
        if (statuses.some((s: string) => s === "REJECTED")) {
          listOrderStatus = "REJECTED";
        }
        // OCO is done if at least one order filled (other should be canceled)
        else if (statuses.some((s: string) => s === "FILLED")) {
          listOrderStatus = "ALL_DONE";
        }
        // All orders canceled/expired
        else if (
          statuses.every(
            (s: string) => s === "CANCELED" || s === "EXPIRED"
          )
        ) {
          listOrderStatus = "ALL_DONE";
        }
        // At least one partially filled
        else if (statuses.some((s: string) => s === "PARTIALLY_FILLED")) {
          listOrderStatus = "EXECUTING";
        }
        // All orders still active
        else if (statuses.every((s: string) => s === "NEW")) {
          listOrderStatus = "EXECUTING";
        }
        // Mixed state or unknown
        else {
          listOrderStatus = "EXECUTING";
          console.warn(
            `[OCO API] Unknown status combination for orderListId ${orderListId}:`,
            statuses
          );
        }

        return {
          orderListId,
          symbol: trade.symbol,
          orders: orders.map((order: IOrder) => ({
            orderId: order.orderId,
            type: order.type,
            price: order.price || 0,
            stopPrice: order.stopPrice,
            quantity: order.quantity,
            status: order.status,
            executedQty: order.executedQty || 0,
          })),
          status: listOrderStatus,
          createdAt:
            orders[0]?.timestamp?.toISOString() ||
            trade.createdAt?.toISOString() ||
            new Date().toISOString(),
          testnet: trade.testnet ?? false,
        };
      });
    });

    const transformTime = Date.now() - startTime - queryTime;
    console.log(
      `[OCO API] Transformed to ${allOCOOrders.length} OCO orders in ${transformTime}ms`
    );

    // 7. Apply status filter
    let filteredOrders = allOCOOrders;
    if (statusFilter !== "all") {
      filteredOrders = filteredOrders.filter(
        (order: (typeof allOCOOrders)[0]) => {
          // Map status filter to listOrderStatus
          if (statusFilter === "FILLED") {
            return order.status === "ALL_DONE";
          }
          return order.status === statusFilter;
        }
      );
    }

    // 8. Apply pagination
    const totalOrders = filteredOrders.length;
    const totalPages = Math.ceil(totalOrders / limit);
    const skip = Math.max(0, (page - 1) * limit);
    const paginatedOrders = filteredOrders.slice(skip, skip + limit);

    console.log(
      `[OCO API] Returning ${paginatedOrders.length} orders (page ${page}/${totalPages})`
    );

    // 9. Return response
    // Serialize MongoDB ObjectIds to strings (prevents [object Object] in OCO UI)
    return NextResponse.json({
      success: true,
      data: serializeResponse(paginatedOrders),
      pagination: {
        page,
        limit,
        total: totalOrders, // Filtered count
        totalUnfiltered: allOCOOrders.length, // H3: Total count before filtering
        pages: totalPages,
        actualCount: paginatedOrders.length,
      },
      meta: {
        source: "database",
        queryTimeMs: queryTime,
        transformTimeMs: transformTime,
        ...(paginatedOrders.some((o) => o.status === "EXECUTING") && {
          note: "For real-time updates on active orders, WebSocket stream is recommended.",
        }),
      },
    });
  } catch (error: unknown) {
    console.error("[OCO API] Error fetching OCO orders from database:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          message:
            error instanceof Error && error.message.includes("timeout")
              ? "Database query timeout. Try using filters to narrow results."
              : "Failed to fetch OCO orders. Please try again later.",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

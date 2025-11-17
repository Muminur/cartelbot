import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { connectDB } from "@/lib/db/connection";
import { Trade } from "@/lib/db/models/Trade";

/**
 * GET /api/oco
 *
 * Fetch all user's OCO orders from database
 *
 * Query params:
 * - symbol: Filter by symbol (case-insensitive regex)
 * - status: Filter by status (all | NEW | FILLED | CANCELED | PARTIALLY_FILLED)
 * - network: Filter by network (all | mainnet | testnet)
 * - page: Page number (default 1)
 * - limit: Items per page (default 20)
 * - sortBy: Sort field (default "createdAt")
 * - sortOrder: Sort order (asc | desc, default "desc")
 *
 * Returns:
 * - Array of OCO orders with details
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

    // 2. Connect to database
    await connectDB();

    // 3. Parse query parameters
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol") || "";
    const status = searchParams.get("status") || "all";
    const network = searchParams.get("network") || "all";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    // Helper function to escape special regex characters (prevents NoSQL injection)
    const escapeRegex = (str: string): string => {
      return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    // 4. Build query
    const query: any = {
      userId: String(authResult.user._id),
      "sellOrders.0": { $exists: true }, // Has at least one sell order (OCO)
    };

    // Filter by symbol (sanitize input before using in regex)
    if (symbol) {
      const sanitizedSymbol = escapeRegex(symbol.trim());
      query.symbol = { $regex: sanitizedSymbol, $options: "i" };
    }

    // Filter by status (check all sellOrders for matching status)
    if (status !== "all") {
      query["sellOrders.status"] = status;
    }

    // Filter by network
    if (network !== "all") {
      query.testnet = network === "testnet";
    }

    // 5. Build sort object
    const sortObj: any = {};
    sortObj[sortBy] = sortOrder === "asc" ? 1 : -1;

    // 6. Execute query WITHOUT pagination (get all trades first)
    // We need all trades because each trade can have multiple OCO orders
    // Pagination will be applied to OCO orders, not trades
    const allTrades = await Trade.find(query)
      .sort(sortObj)
      .populate("signalId", "symbol rawSignal entries targets stopLoss")
      .lean();

    // 7. Transform ALL trades to OCO order format
    const allOcoOrders: any[] = [];

    for (const trade of allTrades) {
      // Group sell orders by orderListId
      const ordersByListId = new Map<number, any[]>();

      (trade.sellOrders || []).forEach((order: any) => {
        if (order.orderListId) {
          if (!ordersByListId.has(order.orderListId)) {
            ordersByListId.set(order.orderListId, []);
          }
          ordersByListId.get(order.orderListId)!.push(order);
        }
      });

      // Create OCO order entry for each orderListId
      ordersByListId.forEach((orders, orderListId) => {
        // Determine overall status for this OCO order
        const allFilled = orders.every((o) => o.status === "FILLED");
        const allCanceled = orders.every((o) => o.status === "CANCELED");
        const someFilled = orders.some((o) => o.status === "FILLED");

        const ocoStatus = allFilled
          ? "FILLED"
          : allCanceled
            ? "CANCELED"
            : someFilled
              ? "PARTIALLY_FILLED"
              : "NEW";

        allOcoOrders.push({
          orderListId,
          symbol: trade.symbol,
          orders: orders.map((o) => ({
            orderId: o.orderId,
            type: o.type,
            price: o.price,
            stopPrice: o.stopPrice,
            quantity: o.quantity,
            status: o.status,
            executedQty: o.executedQty || 0,
          })),
          status: ocoStatus,
          createdAt: trade.createdAt,
          testnet: trade.testnet || false,
          tradeId: trade._id,
          signalId: trade.signalId,
        });
      });
    }

    // 8. Apply pagination to OCO orders (not trades)
    const total = allOcoOrders.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedOcoOrders = allOcoOrders.slice(startIndex, endIndex);

    // 9. Return response
    return NextResponse.json({
      success: true,
      data: paginatedOcoOrders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    console.error("[OCO API] Error fetching OCO orders:", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          message:
            error instanceof Error
              ? error.message
              : "Failed to fetch OCO orders",
          code: "FETCH_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

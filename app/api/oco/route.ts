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

    // TypeScript interface for query object
    interface TradeQuery {
      userId: string;
      "sellOrders.0": { $exists: boolean };
      symbol?: { $regex: string; $options: string };
      "sellOrders.status"?: string;
      testnet?: boolean;
    }

    // 4. Build query
    const query: TradeQuery = {
      userId: String(authResult.user._id),
      "sellOrders.0": { $exists: true }, // Has at least one sell order (OCO)
    };

    // Filter by symbol (sanitize input before using in regex)
    if (symbol) {
      const sanitized = symbol.trim().toUpperCase();

      // C3: Prevent ReDoS with length limit
      if (sanitized.length > 20) {
        return NextResponse.json(
          { success: false, error: { message: "Symbol too long (max 20 chars)" } },
          { status: 400 }
        );
      }

      query.symbol = { $regex: escapeRegex(sanitized), $options: "i" };
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

    // 6. Get accurate OCO order count using MongoDB aggregation
    // C1: FIX - Replaced arbitrary multiplier with accurate count
    const ocoCountPipeline = await Trade.aggregate([
      { $match: query },
      {
        $project: {
          ocoCount: {
            $size: { $ifNull: ["$sellOrders", []] }
          }
        }
      },
      { $group: { _id: null, total: { $sum: "$ocoCount" } } }
    ]);
    const totalOCOs = ocoCountPipeline[0]?.total || 0;

    // 7. OPTIMIZATION: Use MongoDB pagination with a reasonable multiplier
    // Since each trade can have multiple OCO orders, we fetch more trades than needed
    // Multiplier of 2 should cover most cases (average 2 OCO orders per trade)
    const estimatedTradesNeeded = limit * 2;
    const skip = Math.max(0, (page - 1) * limit);

    // Fetch trades with pagination applied at database level
    const paginatedTrades = await Trade.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(estimatedTradesNeeded)
      .populate("signalId", "symbol rawSignal entries targets stopLoss")
      .lean();

    // 8. Transform paginated trades to OCO order format
    const ocoOrders: any[] = [];

    for (const trade of paginatedTrades) {
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

        ocoOrders.push({
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

    // 9. Trim to exact page size if we got more than needed
    const paginatedOcoOrders = ocoOrders.slice(0, limit);

    // 10. Return response with accurate pagination
    // C1: FIX - Using accurate OCO count instead of estimation
    return NextResponse.json({
      success: true,
      data: paginatedOcoOrders,
      pagination: {
        page,
        limit,
        total: totalOCOs,
        pages: Math.ceil(totalOCOs / limit),
        actualCount: paginatedOcoOrders.length,
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

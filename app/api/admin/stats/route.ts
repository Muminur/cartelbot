import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/middleware/admin-auth";
import { connectDB } from "@/lib/db";
import { User, Signal, Trade, WebSocketSession } from "@/lib/db/models";

export async function GET(request: Request) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.response;

  try {
    await connectDB();

    // Get current date for "today" calculations
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // User statistics
    const [totalUsers, activeUsers, usersWithKeys, tierCounts] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ hasApiKeys: true }),
      User.aggregate([
        {
          $group: {
            _id: "$subscriptionTier",
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const byTier = {
      free: tierCounts.find((t) => t._id === "free")?.count || 0,
      premium: tierCounts.find((t) => t._id === "premium")?.count || 0,
      pro: tierCounts.find((t) => t._id === "pro")?.count || 0,
    };

    // Signal statistics
    const [totalSignals, signalsToday, signalsByStatus] = await Promise.all([
      Signal.countDocuments(),
      Signal.countDocuments({ createdAt: { $gte: today } }),
      Signal.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const signalStats = {
      pending: signalsByStatus.find((s) => s._id === "pending")?.count || 0,
      executing: signalsByStatus.find((s) => s._id === "executing")?.count || 0,
      completed: signalsByStatus.find((s) => s._id === "completed")?.count || 0,
      failed: signalsByStatus.find((s) => s._id === "failed")?.count || 0,
    };

    // Trade statistics
    const [totalTrades, openTrades, closedTrades, tradeAggregates] = await Promise.all([
      Trade.countDocuments(),
      Trade.countDocuments({ status: "open" }),
      Trade.countDocuments({ status: "closed" }),
      Trade.aggregate([
        {
          $match: { status: "closed" },
        },
        {
          $group: {
            _id: null,
            totalVolume: { $sum: "$investedAmount" },
            totalPnL: { $sum: "$profitLoss" },
          },
        },
      ]),
    ]);

    const tradeData = tradeAggregates[0] || { totalVolume: 0, totalPnL: 0 };

    // System statistics
    const wsConnections = await WebSocketSession.countDocuments({ status: "active" });

    const stats = {
      users: {
        total: totalUsers,
        active: activeUsers,
        withApiKeys: usersWithKeys,
        byTier,
      },
      signals: {
        total: totalSignals,
        today: signalsToday,
        pending: signalStats.pending,
        executing: signalStats.executing,
        completed: signalStats.completed,
        failed: signalStats.failed,
      },
      trades: {
        total: totalTrades,
        open: openTrades,
        closed: closedTrades,
        totalVolume: tradeData.totalVolume,
        totalPnL: tradeData.totalPnL,
      },
      system: {
        websocketConnections: wsConnections,
        apiCallsToday: 0, // TODO: Implement API call tracking
        errorRate: 0, // TODO: Implement error rate tracking
      },
    };

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Error fetching admin stats:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "STATS_FETCH_FAILED",
          message: error instanceof Error ? error.message : "Failed to fetch statistics",
          statusCode: 500,
        },
      },
      { status: 500 }
    );
  }
}

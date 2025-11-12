import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { connectDB } from "@/lib/db/connection";
import { Signal } from "@/lib/db/models/Signal";
import { Trade } from "@/lib/db/models/Trade";

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await getUserFromRequest(request);
    if (error || !user) {
      return NextResponse.json(
        { success: false, error: error || "Unauthorized" },
        { status: 401 }
      );
    }

    await connectDB();

    const [activeSignals, activeTrades, completedTrades, totalPnL] =
      await Promise.all([
        Signal.countDocuments({
          userId: String(user._id),
          status: { $in: ["pending", "executing"] },
        }),
        Trade.countDocuments({
          userId: String(user._id),
          status: "open",
        }),
        Trade.countDocuments({
          userId: String(user._id),
          status: "closed",
        }),
        Trade.aggregate([
          {
            $match: {
              userId: String(user._id),
              status: "closed",
              realizedPnL: { $exists: true },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$realizedPnL" },
            },
          },
        ]),
      ]);

    const winningTrades = await Trade.countDocuments({
      userId: String(user._id),
      status: "closed",
      realizedPnL: { $gt: 0 },
    });

    const losingTrades = await Trade.countDocuments({
      userId: String(user._id),
      status: "closed",
      realizedPnL: { $lt: 0 },
    });

    const winRate =
      completedTrades > 0 ? (winningTrades / completedTrades) * 100 : 0;

    return NextResponse.json({
      success: true,
      data: {
        activeSignals,
        activeTrades,
        completedTrades,
        totalPnL: totalPnL[0]?.total || 0,
        winningTrades,
        losingTrades,
        winRate: Math.round(winRate * 100) / 100,
      },
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { connectDB } from "@/lib/db/connection";
import { Trade } from "@/lib/db/models/Trade";
import { Signal } from "@/lib/db/models/Signal";
import { rateLimit } from "@/lib/middleware/rate-limiter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Constants for performance limits
const MAX_TRADES_FOR_ANALYTICS = 2000;
const MAX_SIGNALS_FOR_ANALYTICS = 2000;

// Utility function for rounding money values
const roundMoney = (amount: number): number => Math.round(amount * 100) / 100;
const roundPercentage = (pct: number): number => Math.round(pct * 100) / 100;

interface SymbolPerformance {
  symbol: string;
  trades: number;
  totalPnL: number;
  wins: number;
  losses: number;
  winRate: number;
  avgPnL: number;
}

interface DailyPerformance {
  date: string;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
}

interface MonthlyPerformance {
  month: string;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
}

interface TradePerformance {
  symbol: string;
  pnl: number;
  date: string;
  percentage: number;
}

/**
 * GET /api/analytics - Comprehensive trading analytics
 *
 * Rate limited to 20 requests per minute per user
 * Returns comprehensive trading performance analysis
 */
export async function GET(request: NextRequest) {
  try {
    // Get user first for rate limiting by user ID
    const { user, error } = await getUserFromRequest(request);
    if (error || !user) {
      return NextResponse.json(
        { success: false, error: error || "Unauthorized" },
        { status: 401 }
      );
    }

    // Rate limiting by user ID
    const rateLimitResponse = await rateLimit(String(user._id), "api");
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    await connectDB();
    const userId = String(user._id);

    // Validate userId format (MongoDB ObjectId)
    if (!userId || typeof userId !== "string" || !/^[a-f0-9]{24}$/i.test(userId)) {
      return NextResponse.json(
        { success: false, error: "Invalid user ID" },
        { status: 400 }
      );
    }

    // Get closed trades for analytics with pagination limit
    const closedTrades = await Trade.find({
      userId,
      status: "closed",
      realizedPnL: { $exists: true, $ne: null },
    })
      .sort({ updatedAt: -1 })
      .limit(MAX_TRADES_FOR_ANALYTICS)
      .select("symbol realizedPnL investedAmount updatedAt createdAt")
      .lean();

    // Get signals for signal analytics with pagination limit
    const allSignals = await Signal.find({ userId })
      .limit(MAX_SIGNALS_FOR_ANALYTICS)
      .select("status")
      .lean();

    // Calculate overview metrics
    const totalTrades = closedTrades.length;
    const totalPnL = closedTrades.reduce(
      (sum, t) => sum + (t.realizedPnL || 0),
      0
    );
    const winningTrades = closedTrades.filter((t) => (t.realizedPnL || 0) > 0);
    const losingTrades = closedTrades.filter((t) => (t.realizedPnL || 0) < 0);
    const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;
    const avgPnL = totalTrades > 0 ? totalPnL / totalTrades : 0;
    const totalInvested = closedTrades.reduce(
      (sum, t) => sum + (t.investedAmount || 0),
      0
    );
    const roi = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

    // Average win and loss
    const avgWin =
      winningTrades.length > 0
        ? winningTrades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0) /
          winningTrades.length
        : 0;
    const avgLoss =
      losingTrades.length > 0
        ? Math.abs(
            losingTrades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0) /
              losingTrades.length
          )
        : 0;

    // Profit factor
    const grossProfit = winningTrades.reduce(
      (sum, t) => sum + (t.realizedPnL || 0),
      0
    );
    const grossLoss = Math.abs(
      losingTrades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0)
    );
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // Symbol performance
    const symbolMap = new Map<string, { pnl: number; wins: number; losses: number; count: number }>();
    for (const trade of closedTrades) {
      const existing = symbolMap.get(trade.symbol) || { pnl: 0, wins: 0, losses: 0, count: 0 };
      existing.pnl += trade.realizedPnL || 0;
      existing.count += 1;
      if ((trade.realizedPnL || 0) > 0) existing.wins += 1;
      else if ((trade.realizedPnL || 0) < 0) existing.losses += 1;
      symbolMap.set(trade.symbol, existing);
    }

    const symbolPerformance: SymbolPerformance[] = Array.from(symbolMap.entries())
      .map(([symbol, data]) => ({
        symbol,
        trades: data.count,
        totalPnL: roundMoney(data.pnl),
        wins: data.wins,
        losses: data.losses,
        winRate: data.count > 0 ? roundPercentage((data.wins / data.count) * 100) : 0,
        avgPnL: data.count > 0 ? roundMoney(data.pnl / data.count) : 0,
      }))
      .sort((a, b) => b.totalPnL - a.totalPnL);

    // Daily P&L for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyMap = new Map<string, { pnl: number; trades: number; wins: number; losses: number }>();
    for (const trade of closedTrades) {
      const closedDate = trade.updatedAt || trade.createdAt;
      if (!closedDate || new Date(closedDate) < thirtyDaysAgo) continue;

      const dateKey = new Date(closedDate).toISOString().split("T")[0];
      const existing = dailyMap.get(dateKey) || { pnl: 0, trades: 0, wins: 0, losses: 0 };
      existing.pnl += trade.realizedPnL || 0;
      existing.trades += 1;
      if ((trade.realizedPnL || 0) > 0) existing.wins += 1;
      else if ((trade.realizedPnL || 0) < 0) existing.losses += 1;
      dailyMap.set(dateKey, existing);
    }

    const dailyPerformance: DailyPerformance[] = Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date,
        pnl: roundMoney(data.pnl),
        trades: data.trades,
        wins: data.wins,
        losses: data.losses,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Monthly P&L
    const monthlyMap = new Map<string, { pnl: number; trades: number; wins: number; losses: number }>();
    for (const trade of closedTrades) {
      const closedDate = trade.updatedAt || trade.createdAt;
      if (!closedDate) continue;

      const date = new Date(closedDate);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const existing = monthlyMap.get(monthKey) || { pnl: 0, trades: 0, wins: 0, losses: 0 };
      existing.pnl += trade.realizedPnL || 0;
      existing.trades += 1;
      if ((trade.realizedPnL || 0) > 0) existing.wins += 1;
      else if ((trade.realizedPnL || 0) < 0) existing.losses += 1;
      monthlyMap.set(monthKey, existing);
    }

    const monthlyPerformance: MonthlyPerformance[] = Array.from(monthlyMap.entries())
      .map(([month, data]) => ({
        month,
        pnl: roundMoney(data.pnl),
        trades: data.trades,
        wins: data.wins,
        losses: data.losses,
        winRate: data.trades > 0 ? roundPercentage((data.wins / data.trades) * 100) : 0,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Best and worst trades
    const tradesWithPercentage = closedTrades
      .filter((t) => t.investedAmount && t.investedAmount > 0)
      .map((t) => ({
        symbol: t.symbol,
        pnl: t.realizedPnL || 0,
        date: t.updatedAt ? new Date(t.updatedAt).toISOString().split("T")[0] : "",
        percentage: ((t.realizedPnL || 0) / t.investedAmount) * 100,
      }));

    const bestTrades: TradePerformance[] = [...tradesWithPercentage]
      .sort((a, b) => b.pnl - a.pnl)
      .slice(0, 5)
      .map((t) => ({
        ...t,
        pnl: roundMoney(t.pnl),
        percentage: roundPercentage(t.percentage),
      }));

    const worstTrades: TradePerformance[] = [...tradesWithPercentage]
      .sort((a, b) => a.pnl - b.pnl)
      .slice(0, 5)
      .map((t) => ({
        ...t,
        pnl: roundMoney(t.pnl),
        percentage: roundPercentage(t.percentage),
      }));

    // Day of week performance
    const dayOfWeekMap = new Map<number, { pnl: number; trades: number; wins: number }>();
    for (const trade of closedTrades) {
      const closedDate = trade.updatedAt || trade.createdAt;
      if (!closedDate) continue;

      const dayOfWeek = new Date(closedDate).getDay();
      const existing = dayOfWeekMap.get(dayOfWeek) || { pnl: 0, trades: 0, wins: 0 };
      existing.pnl += trade.realizedPnL || 0;
      existing.trades += 1;
      if ((trade.realizedPnL || 0) > 0) existing.wins += 1;
      dayOfWeekMap.set(dayOfWeek, existing);
    }

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayOfWeekPerformance = dayNames.map((name, index) => {
      const data = dayOfWeekMap.get(index) || { pnl: 0, trades: 0, wins: 0 };
      return {
        day: name,
        pnl: roundMoney(data.pnl),
        trades: data.trades,
        winRate: data.trades > 0 ? roundPercentage((data.wins / data.trades) * 100) : 0,
      };
    });

    // Signal statistics
    const signalStats = {
      total: allSignals.length,
      completed: allSignals.filter((s) => s.status === "completed").length,
      failed: allSignals.filter((s) => s.status === "failed").length,
      executing: allSignals.filter((s) => s.status === "executing").length,
      cancelled: allSignals.filter((s) => s.status === "cancelled").length,
      pending: allSignals.filter((s) => s.status === "pending" || s.status === "parsed").length,
    };

    // Current streak
    let currentStreak = 0;
    let streakType: "win" | "loss" | "none" = "none";
    const sortedTrades = [...closedTrades].sort(
      (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
    );

    for (const trade of sortedTrades) {
      const isWin = (trade.realizedPnL || 0) > 0;
      if (currentStreak === 0) {
        streakType = isWin ? "win" : "loss";
        currentStreak = 1;
      } else if ((streakType === "win" && isWin) || (streakType === "loss" && !isWin)) {
        currentStreak += 1;
      } else {
        break;
      }
    }

    // Max consecutive wins/losses
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let tempWin = 0;
    let tempLoss = 0;
    for (const trade of sortedTrades.reverse()) {
      if ((trade.realizedPnL || 0) > 0) {
        tempWin += 1;
        tempLoss = 0;
        maxWinStreak = Math.max(maxWinStreak, tempWin);
      } else if ((trade.realizedPnL || 0) < 0) {
        tempLoss += 1;
        tempWin = 0;
        maxLossStreak = Math.max(maxLossStreak, tempLoss);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        overview: {
          totalTrades,
          totalPnL: roundMoney(totalPnL),
          winRate: roundPercentage(winRate),
          avgPnL: roundMoney(avgPnL),
          avgWin: roundMoney(avgWin),
          avgLoss: roundMoney(avgLoss),
          profitFactor: profitFactor === Infinity ? "N/A" : roundMoney(profitFactor),
          roi: roundPercentage(roi),
          totalInvested: roundMoney(totalInvested),
          winningTrades: winningTrades.length,
          losingTrades: losingTrades.length,
        },
        streaks: {
          current: {
            type: streakType,
            count: currentStreak,
          },
          maxWin: maxWinStreak,
          maxLoss: maxLossStreak,
        },
        symbolPerformance: symbolPerformance.slice(0, 10),
        dailyPerformance,
        monthlyPerformance,
        bestTrades,
        worstTrades,
        dayOfWeekPerformance,
        signalStats,
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error fetching analytics:", error);
    }
    return NextResponse.json(
      { success: false, error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}

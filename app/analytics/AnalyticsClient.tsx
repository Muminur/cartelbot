"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { API_ROUTES } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils/format";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Area,
  AreaChart,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Target,
  Award,
  BarChart3,
  Calendar,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Flame,
  DollarSign,
  Percent,
  Activity,
  Signal,
} from "lucide-react";

export const dynamic = "force-dynamic";

interface AnalyticsData {
  overview: {
    totalTrades: number;
    totalPnL: number;
    winRate: number;
    avgPnL: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number | string;
    roi: number;
    totalInvested: number;
    winningTrades: number;
    losingTrades: number;
  };
  streaks: {
    current: {
      type: "win" | "loss" | "none";
      count: number;
    };
    maxWin: number;
    maxLoss: number;
  };
  symbolPerformance: {
    symbol: string;
    trades: number;
    totalPnL: number;
    wins: number;
    losses: number;
    winRate: number;
    avgPnL: number;
  }[];
  dailyPerformance: {
    date: string;
    pnl: number;
    trades: number;
    wins: number;
    losses: number;
  }[];
  monthlyPerformance: {
    month: string;
    pnl: number;
    trades: number;
    wins: number;
    losses: number;
    winRate: number;
  }[];
  bestTrades: {
    symbol: string;
    pnl: number;
    date: string;
    percentage: number;
  }[];
  worstTrades: {
    symbol: string;
    pnl: number;
    date: string;
    percentage: number;
  }[];
  dayOfWeekPerformance: {
    day: string;
    pnl: number;
    trades: number;
    winRate: number;
  }[];
  signalStats: {
    total: number;
    completed: number;
    failed: number;
    executing: number;
    cancelled: number;
    pending: number;
  };
}

const COLORS = ["#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#ec4899"];

export default function AnalyticsPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string>("");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const sessionResponse = await fetch(API_ROUTES.AUTH.SESSION);
      const sessionData = await sessionResponse.json();

      if (!sessionResponse.ok || !sessionData.success) {
        router.push("/login");
        return;
      }

      setUserEmail(sessionData.data.user.email);

      const analyticsResponse = await fetch("/api/analytics");
      const analyticsData = await analyticsResponse.json();

      if (analyticsData.success) {
        setData(analyticsData.data);
      }
    } catch {
      router.push("/login");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // IMPORTANT: All useMemo hooks must be placed BEFORE any early returns
  // to comply with React's Rules of Hooks (hooks must be called in the same order every render)

  // Memoize cumulative P&L calculation for performance
  const cumulativeDailyData = useMemo(() => {
    if (!data?.dailyPerformance) return [];
    return data.dailyPerformance.reduce(
      (acc: { date: string; pnl: number; cumulative: number }[], day, index) => {
        const cumulative = index === 0 ? day.pnl : acc[index - 1].cumulative + day.pnl;
        acc.push({ ...day, cumulative });
        return acc;
      },
      []
    );
  }, [data?.dailyPerformance]);

  // Memoize pie chart data for signal stats
  const signalPieData = useMemo(() => {
    if (!data?.signalStats) return [];
    return [
      { name: "Completed", value: data.signalStats.completed, color: "#10b981" },
      { name: "Failed", value: data.signalStats.failed, color: "#ef4444" },
      { name: "Executing", value: data.signalStats.executing, color: "#f59e0b" },
      { name: "Cancelled", value: data.signalStats.cancelled, color: "#6b7280" },
      { name: "Pending", value: data.signalStats.pending, color: "#3b82f6" },
    ].filter((d) => d.value > 0);
  }, [data?.signalStats]);

  // Early returns AFTER all hooks
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div
          className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"
          role="status"
          aria-label="Loading analytics data"
        />
      </div>
    );
  }

  if (!data) {
    return (
      <DashboardLayout userEmail={userEmail}>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Unable to load analytics data.</p>
          <Button onClick={handleRefresh} className="mt-4">
            Try Again
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userEmail={userEmail}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Analytics</h1>
            <p className="text-muted-foreground mt-1">
              Comprehensive trading performance analysis
            </p>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            variant="outline"
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Overview Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total P&L
              </CardTitle>
              <DollarSign className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${
                  data.overview.totalPnL >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                }`}
              >
                {formatCurrency(data.overview.totalPnL)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                ROI: {data.overview.roi}%
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Win Rate
              </CardTitle>
              <Target className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {data.overview.winRate}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {data.overview.winningTrades}W / {data.overview.losingTrades}L
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Profit Factor
              </CardTitle>
              <Activity className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {data.overview.profitFactor}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Gross profit / Gross loss
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Trades
              </CardTitle>
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {data.overview.totalTrades}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Invested: {formatCurrency(data.overview.totalInvested)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Current Streak
              </CardTitle>
              <Flame className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${
                  data.streaks.current.type === "win"
                    ? "text-green-600 dark:text-green-400"
                    : data.streaks.current.type === "loss"
                    ? "text-red-600 dark:text-red-400"
                    : "text-muted-foreground"
                }`}
              >
                {data.streaks.current.count}{" "}
                {data.streaks.current.type !== "none"
                  ? data.streaks.current.type === "win"
                    ? "Wins"
                    : "Losses"
                  : "-"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Best: {data.streaks.maxWin}W | Worst: {data.streaks.maxLoss}L
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Win/Loss Average */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Average Win
              </CardTitle>
              <ArrowUpRight className="w-4 h-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                +{formatCurrency(data.overview.avgWin)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Per winning trade
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Average Loss
              </CardTitle>
              <ArrowDownRight className="w-4 h-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                -{formatCurrency(data.overview.avgLoss)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Per losing trade
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 1 */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* P&L Over Time */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Cumulative P&L (Last 30 Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {cumulativeDailyData.length === 0 ? (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                  No data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={cumulativeDailyData}>
                    <defs>
                      <linearGradient id="colorPnL" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      fontSize={12}
                      tickFormatter={(value) => value.slice(5)}
                      className="text-muted-foreground"
                    />
                    <YAxis
                      fontSize={12}
                      tickFormatter={(value) => `$${value}`}
                      className="text-muted-foreground"
                    />
                    <Tooltip
                      formatter={(value: number) => [formatCurrency(value), "Cumulative P&L"]}
                      labelStyle={{ color: "var(--foreground)" }}
                      contentStyle={{
                        backgroundColor: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="cumulative"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      fill="url(#colorPnL)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Daily P&L Bars */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Daily P&L (Last 30 Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.dailyPerformance.length === 0 ? (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                  No data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.dailyPerformance}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      fontSize={12}
                      tickFormatter={(value) => value.slice(5)}
                      className="text-muted-foreground"
                    />
                    <YAxis
                      fontSize={12}
                      tickFormatter={(value) => `$${value}`}
                      className="text-muted-foreground"
                    />
                    <Tooltip
                      formatter={(value: number) => [formatCurrency(value), "P&L"]}
                      contentStyle={{
                        backgroundColor: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                      }}
                    />
                    <Bar
                      dataKey="pnl"
                      fill="#8b5cf6"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 2 */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Monthly Performance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Monthly Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.monthlyPerformance.length === 0 ? (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                  No data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.monthlyPerformance}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="month"
                      fontSize={12}
                      className="text-muted-foreground"
                    />
                    <YAxis
                      fontSize={12}
                      tickFormatter={(value) => `$${value}`}
                      className="text-muted-foreground"
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        name === "pnl" ? formatCurrency(value) : value,
                        name === "pnl" ? "P&L" : name === "winRate" ? "Win Rate %" : name,
                      ]}
                      contentStyle={{
                        backgroundColor: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                      }}
                    />
                    <Legend />
                    <Bar dataKey="pnl" name="P&L" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Day of Week Performance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Performance by Day of Week
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.dayOfWeekPerformance}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" fontSize={12} className="text-muted-foreground" />
                  <YAxis
                    fontSize={12}
                    tickFormatter={(value) => `$${value}`}
                    className="text-muted-foreground"
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      name === "pnl" ? formatCurrency(value) : `${value}%`,
                      name === "pnl" ? "P&L" : "Win Rate",
                    ]}
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                  <Bar dataKey="pnl" name="P&L" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Symbol Performance & Signal Stats */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Top Symbols */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="w-5 h-5" />
                Top Performing Symbols
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.symbolPerformance.length === 0 ? (
                <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                  No data available
                </div>
              ) : (
                <div className="space-y-3">
                  {data.symbolPerformance.slice(0, 5).map((symbol, index) => (
                    <div
                      key={symbol.symbol}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xs font-medium">
                          {index + 1}
                        </span>
                        <div>
                          <p className="font-medium text-foreground">{symbol.symbol}</p>
                          <p className="text-xs text-muted-foreground">
                            {symbol.trades} trades | {symbol.winRate}% win rate
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p
                          className={`font-semibold ${
                            symbol.totalPnL >= 0
                              ? "text-green-600 dark:text-green-400"
                              : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {formatCurrency(symbol.totalPnL)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Avg: {formatCurrency(symbol.avgPnL)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Signal Stats Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Signal className="w-5 h-5" />
                Signal Status Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.signalStats.total === 0 ? (
                <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                  No signals yet
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="50%" height={200}>
                    <PieChart>
                      <Pie
                        data={signalPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {signalPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => [value, "Signals"]}
                        contentStyle={{
                          backgroundColor: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {signalPieData.map((item) => (
                      <div key={item.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-sm text-muted-foreground">{item.name}</span>
                        </div>
                        <span className="text-sm font-medium text-foreground">{item.value}</span>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-border">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Total</span>
                        <span className="text-sm font-bold text-foreground">
                          {data.signalStats.total}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Best & Worst Trades */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Best Trades */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <TrendingUp className="w-5 h-5" />
                Best Trades
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.bestTrades.length === 0 ? (
                <div className="flex items-center justify-center h-[150px] text-muted-foreground">
                  No winning trades yet
                </div>
              ) : (
                <div className="space-y-3">
                  {data.bestTrades.map((trade, index) => (
                    <div
                      key={`${trade.symbol}-${trade.date}-${index}`}
                      className="flex items-center justify-between p-3 rounded-lg bg-green-50 dark:bg-green-950/30"
                    >
                      <div>
                        <p className="font-medium text-foreground">{trade.symbol}</p>
                        <p className="text-xs text-muted-foreground">{trade.date}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-green-600 dark:text-green-400">
                          +{formatCurrency(trade.pnl)}
                        </p>
                        <p className="text-xs text-green-600 dark:text-green-400">
                          +{trade.percentage}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Worst Trades */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <TrendingDown className="w-5 h-5" />
                Worst Trades
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.worstTrades.length === 0 ? (
                <div className="flex items-center justify-center h-[150px] text-muted-foreground">
                  No losing trades yet
                </div>
              ) : (
                <div className="space-y-3">
                  {data.worstTrades.map((trade, index) => (
                    <div
                      key={`${trade.symbol}-${trade.date}-${index}`}
                      className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-950/30"
                    >
                      <div>
                        <p className="font-medium text-foreground">{trade.symbol}</p>
                        <p className="text-xs text-muted-foreground">{trade.date}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-red-600 dark:text-red-400">
                          {formatCurrency(trade.pnl)}
                        </p>
                        <p className="text-xs text-red-600 dark:text-red-400">
                          {trade.percentage}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

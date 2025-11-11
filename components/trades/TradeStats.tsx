"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  Award,
  AlertTriangle,
} from "lucide-react";
import { formatCurrency, formatPercentage } from "@/lib/utils/format";

interface TradeStatsData {
  totalTrades: number;
  activePositions: number;
  totalPnL: number;
  winRate: number;
  avgPnLPerTrade: number;
  bestTrade: number;
  worstTrade: number;
}

export function TradeStats() {
  const [stats, setStats] = useState<TradeStatsData>({
    totalTrades: 0,
    activePositions: 0,
    totalPnL: 0,
    winRate: 0,
    avgPnLPerTrade: 0,
    bestTrade: 0,
    worstTrade: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Fetch all trades to calculate statistics
        const response = await fetch("/api/trades?limit=1000");
        const data = await response.json();

        if (data.success && data.data) {
          const trades = data.data;

          // Calculate statistics
          const totalTrades = trades.length;
          const activePositions = trades.filter(
            (t: { status: string }) => t.status === "open" || t.status === "partial"
          ).length;

          const closedTrades = trades.filter((t: { status: string }) => t.status === "closed");

          const totalPnL = closedTrades.reduce(
            (sum: number, t: { realizedPnL?: number }) => sum + (t.realizedPnL || 0),
            0
          );

          const winningTrades = closedTrades.filter((t: { realizedPnL?: number }) => (t.realizedPnL || 0) > 0);
          const winRate = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0;

          const avgPnLPerTrade = closedTrades.length > 0 ? totalPnL / closedTrades.length : 0;

          const pnlValues = closedTrades.map((t: { realizedPnL?: number }) => t.realizedPnL || 0);
          const bestTrade = pnlValues.length > 0 ? Math.max(...pnlValues) : 0;
          const worstTrade = pnlValues.length > 0 ? Math.min(...pnlValues) : 0;

          setStats({
            totalTrades,
            activePositions,
            totalPnL,
            winRate,
            avgPnLPerTrade,
            bestTrade,
            worstTrade,
          });
        }
      } catch (error) {
        console.error("Error fetching trade stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-24 mb-2" />
                <div className="h-8 bg-gray-200 rounded w-32" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const statCards = [
    {
      title: "Total Trades",
      value: stats.totalTrades.toString(),
      icon: Activity,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "Active Positions",
      value: stats.activePositions.toString(),
      icon: Target,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
    {
      title: "Total P&L",
      value: formatCurrency(stats.totalPnL),
      icon: stats.totalPnL >= 0 ? TrendingUp : TrendingDown,
      color: stats.totalPnL >= 0 ? "text-green-600" : "text-red-600",
      bgColor: stats.totalPnL >= 0 ? "bg-green-50" : "bg-red-50",
    },
    {
      title: "Win Rate",
      value: formatPercentage(stats.winRate / 100),
      icon: DollarSign,
      color: stats.winRate >= 50 ? "text-green-600" : "text-yellow-600",
      bgColor: stats.winRate >= 50 ? "bg-green-50" : "bg-yellow-50",
    },
  ];

  const additionalStats = [
    {
      title: "Avg P&L per Trade",
      value: formatCurrency(stats.avgPnLPerTrade),
      icon: Activity,
      color: stats.avgPnLPerTrade >= 0 ? "text-green-600" : "text-red-600",
      bgColor: stats.avgPnLPerTrade >= 0 ? "bg-green-50" : "bg-red-50",
    },
    {
      title: "Best Trade",
      value: formatCurrency(stats.bestTrade),
      icon: Award,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      title: "Worst Trade",
      value: formatCurrency(stats.worstTrade),
      icon: AlertTriangle,
      color: "text-red-600",
      bgColor: "bg-red-50",
    },
  ];

  return (
    <div className="space-y-4 mb-6">
      {/* Primary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${stat.color}`}>
                  {stat.value}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {additionalStats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className={`text-xl font-bold ${stat.color}`}>
                  {stat.value}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

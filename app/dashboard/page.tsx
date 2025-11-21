"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { API_ROUTES } from "@/lib/constants";
import { UserProfile } from "@/types";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ActiveSignalsWidget } from "@/components/dashboard/ActiveSignalsWidget";
import { OpenPositionsWidget } from "@/components/dashboard/OpenPositionsWidget";
import { AccountBalanceWidget } from "@/components/dashboard/AccountBalanceWidget";
import { PnLChartWidget } from "@/components/dashboard/PnLChartWidget";
import { RecentTradesWidget } from "@/components/dashboard/RecentTradesWidget";
import SubscriptionStatusWidget from "@/components/dashboard/SubscriptionStatusWidget";
import { useWebSocketStream } from "@/hooks/useWebSocketStream";
import { TrendingUp, Signal, Wallet, Award } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";

interface DashboardStats {
  activeSignals: number;
  activeTrades: number;
  completedTrades: number;
  totalPnL: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingRefresh, setPendingRefresh] = useState(false);

  // Debounced refresh to prevent too many updates
  useEffect(() => {
    if (pendingRefresh) {
      const timer = setTimeout(() => {
        setRefreshKey((prev) => prev + 1);
        setPendingRefresh(false);
      }, 2000); // Wait 2 seconds before refreshing

      return () => clearTimeout(timer);
    }
  }, [pendingRefresh]);

  const { isConnected, lastEvent } = useWebSocketStream({
    autoConnect: true,
    onEvent: (event) => {
      if (event.type === "executionReport" || event.type === "listStatus") {
        // Mark that we need to refresh, but don't do it immediately
        setPendingRefresh(true);
      }
    },
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sessionResponse, statsResponse] = await Promise.all([
          fetch(API_ROUTES.AUTH.SESSION),
          fetch("/api/stats"),
        ]);

        const sessionData = await sessionResponse.json();
        const statsData = await statsResponse.json();

        if (!sessionResponse.ok || !sessionData.success) {
          router.push("/login");
          return;
        }

        setUser(sessionData.data.user);

        if (statsData.success) {
          setStats(statsData.data);
        }
      } catch {
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router, refreshKey]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <DashboardLayout userEmail={user.email}>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground mt-2">Welcome back to CartelBot</p>
          </div>
          <div className="flex items-center gap-2">
            {isConnected && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 text-green-700 text-sm">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Live
              </div>
            )}
            <Button onClick={() => router.push("/signals")} className="h-12 md:h-10 text-base md:text-sm">
              Submit Signal
            </Button>
          </div>
        </div>

        {stats && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Active Signals</CardTitle>
                <Signal className="w-4 h-4 text-gray-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.activeSignals}</div>
                <p className="text-xs text-gray-500 mt-1">Pending execution</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Open Positions</CardTitle>
                <TrendingUp className="w-4 h-4 text-gray-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.activeTrades}</div>
                <p className="text-xs text-gray-500 mt-1">Currently trading</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total P&L</CardTitle>
                <Wallet className="w-4 h-4 text-gray-500" />
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl font-bold ${
                    stats.totalPnL >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {formatCurrency(stats.totalPnL)}
                </div>
                <p className="text-xs text-gray-500 mt-1">All-time performance</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
                <Award className="w-4 h-4 text-gray-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.winRate}%</div>
                <p className="text-xs text-gray-500 mt-1">
                  {stats.winningTrades}W / {stats.losingTrades}L
                </p>
              </CardContent>
            </Card>

            <SubscriptionStatusWidget key={`subscription-${refreshKey}`} />
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <ActiveSignalsWidget key={`signals-${refreshKey}`} />
          <AccountBalanceWidget key={`balance-${refreshKey}`} />
        </div>

        <PnLChartWidget key={`chart-${refreshKey}`} />

        <div className="grid gap-6 lg:grid-cols-2">
          <OpenPositionsWidget key={`positions-${refreshKey}`} />
          <RecentTradesWidget key={`recent-${refreshKey}`} />
        </div>
      </div>
    </DashboardLayout>
  );
}

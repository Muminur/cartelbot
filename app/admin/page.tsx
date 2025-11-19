"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Radio, TrendingUp, DollarSign, Activity, AlertCircle } from "lucide-react";

interface SystemStats {
  users: {
    total: number;
    active: number;
    withApiKeys: number;
    byTier: { free: number; premium: number; pro: number };
  };
  signals: {
    total: number;
    today: number;
    pending: number;
    executing: number;
    completed: number;
    failed: number;
  };
  trades: {
    total: number;
    open: number;
    closed: number;
    totalVolume: number;
    totalPnL: number;
  };
  system: {
    websocketConnections: number;
    apiCallsToday: number;
    errorRate: number;
  };
}

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch("/api/admin/stats");
      const data = await response.json();

      if (data.success) {
        setStats(data.data);
      } else {
        setError(data.error?.message || "Failed to load stats");
      }
    } catch (err) {
      console.error("Error fetching admin stats:", err);
      setError("Failed to load system statistics");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-red-600">
              <AlertCircle className="h-5 w-5" />
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground dark:text-white">Admin Dashboard</h1>
        <p className="text-muted-foreground dark:text-gray-400 mt-2">System overview and statistics</p>
      </div>

      {/* User Stats */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground dark:text-gray-400">
              Total Users
            </CardTitle>
            <Users className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground dark:text-white">{stats.users.total}</div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {stats.users.active} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground dark:text-gray-400">
              With API Keys
            </CardTitle>
            <Activity className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground dark:text-white">
              {stats.users.withApiKeys}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {((stats.users.withApiKeys / stats.users.total) * 100).toFixed(1)}% configured
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground dark:text-gray-400">
              Total Signals
            </CardTitle>
            <Radio className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground dark:text-white">{stats.signals.total}</div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {stats.signals.today} today
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground dark:text-gray-400">
              Total P&L
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.trades.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${stats.trades.totalPnL.toFixed(2)}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {stats.trades.closed} closed trades
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Subscription Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Subscription Tiers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Free</span>
                <Badge variant="outline">{stats.users.byTier.free}</Badge>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-gray-500 h-2 rounded-full"
                  style={{
                    width: `${(stats.users.byTier.free / stats.users.total) * 100}%`,
                  }}
                />
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Premium</span>
                <Badge variant="outline">{stats.users.byTier.premium}</Badge>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full"
                  style={{
                    width: `${(stats.users.byTier.premium / stats.users.total) * 100}%`,
                  }}
                />
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Pro</span>
                <Badge variant="outline">{stats.users.byTier.pro}</Badge>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-purple-500 h-2 rounded-full"
                  style={{
                    width: `${(stats.users.byTier.pro / stats.users.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Signal Status */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Signal Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground dark:text-gray-400">Pending</span>
                <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                  {stats.signals.pending}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground dark:text-gray-400">Executing</span>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  {stats.signals.executing}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground dark:text-gray-400">Completed</span>
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  {stats.signals.completed}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground dark:text-gray-400">Failed</span>
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                  {stats.signals.failed}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Trade Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground dark:text-gray-400">Open Positions</span>
                <Badge variant="outline">{stats.trades.open}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground dark:text-gray-400">Total Trades</span>
                <Badge variant="outline">{stats.trades.total}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground dark:text-gray-400">Total Volume</span>
                <span className="text-sm font-medium">
                  ${stats.trades.totalVolume.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground dark:text-gray-400">WebSocket Connections</span>
                <Badge variant="outline">{stats.system.websocketConnections}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

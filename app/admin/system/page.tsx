"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Database,
  Wifi,
  Activity,
  Clock,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";

interface SystemHealth {
  database: {
    status: string;
    connected: boolean;
    host: string;
  };
  websocket: {
    activeConnections: number;
    totalSessions: number;
    healthy: boolean;
  };
  activity: {
    signalsLast24h: number;
    tradesLast24h: number;
    failedSignalsLast24h: number;
    errorRate: string;
  };
  system: {
    nodeVersion: string;
    platform: string;
    memory: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
    };
    uptime: string;
    uptimeSeconds: number;
  };
  timestamp: string;
}

export default function AdminSystemPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetchHealth(controller.signal);

    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      const intervalController = new AbortController();
      fetchHealth(intervalController.signal);
    }, 30000);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchHealth = async (signal?: AbortSignal) => {
    if (health) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await fetch("/api/admin/system/health", { signal });
      const data = await response.json();

      if (data.success) {
        setHealth(data.data);
      } else {
        toast.error(data.error?.message || "Failed to load system health");
      }
    } catch (error) {
      // Ignore abort errors when component unmounts
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Error fetching system health:", error);
      toast.error("Failed to load system health");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  if (loading && !health) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  if (!health) return null;

  const getStatusIcon = (status: boolean) => {
    return status ? (
      <CheckCircle2 className="h-5 w-5 text-green-500" />
    ) : (
      <XCircle className="h-5 w-5 text-red-500" />
    );
  };

  const getErrorRateColor = (rate: string) => {
    const numRate = parseFloat(rate);
    if (numRate < 5) return "text-green-600";
    if (numRate < 15) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground dark:text-white">System Monitoring</h1>
          <p className="text-muted-foreground dark:text-gray-400 mt-2">
            Real-time system health and performance metrics
          </p>
        </div>
        <Button onClick={() => fetchHealth()} disabled={refreshing} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Status Overview */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground dark:text-gray-400">
              Database
            </CardTitle>
            <Database className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {getStatusIcon(health.database.connected)}
              <span className="text-lg font-semibold capitalize">{health.database.status}</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{health.database.host}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground dark:text-gray-400">
              WebSocket
            </CardTitle>
            <Wifi className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {getStatusIcon(health.websocket.healthy)}
              <span className="text-lg font-semibold">
                {health.websocket.activeConnections} Active
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {health.websocket.totalSessions} total sessions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground dark:text-gray-400">
              Error Rate
            </CardTitle>
            <Activity className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className={`text-lg font-semibold ${getErrorRateColor(health.activity.errorRate)}`}>
                {health.activity.errorRate}%
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {health.activity.failedSignalsLast24h} failures (24h)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground dark:text-gray-400">
              Uptime
            </CardTitle>
            <Clock className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{health.system.uptime}</div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {health.system.platform} · {health.system.nodeVersion}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Activity Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Activity (Last 24 Hours)</CardTitle>
          <CardDescription>Signal and trade activity metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <span className="text-sm font-medium text-muted-foreground dark:text-gray-400">
                Signals Submitted
              </span>
              <Badge variant="outline" className="text-lg">
                {health.activity.signalsLast24h}
              </Badge>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <span className="text-sm font-medium text-muted-foreground dark:text-gray-400">
                Trades Executed
              </span>
              <Badge variant="outline" className="text-lg">
                {health.activity.tradesLast24h}
              </Badge>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <span className="text-sm font-medium text-muted-foreground dark:text-gray-400">
                Failed Signals
              </span>
              <Badge
                variant="outline"
                className={`text-lg ${
                  health.activity.failedSignalsLast24h > 0
                    ? "bg-red-50 text-red-700 border-red-200"
                    : ""
                }`}
              >
                {health.activity.failedSignalsLast24h}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Resources */}
      <Card>
        <CardHeader>
          <CardTitle>System Resources</CardTitle>
          <CardDescription>Memory usage and performance metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground dark:text-gray-400">
                  Heap Used
                </span>
                <span className="text-sm font-semibold">
                  {health.system.memory.heapUsed} MB / {health.system.memory.heapTotal} MB
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full"
                  style={{
                    width: `${(health.system.memory.heapUsed / health.system.memory.heapTotal) * 100}%`,
                  }}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 pt-2">
              <div className="text-sm">
                <span className="text-gray-500 dark:text-gray-400">RSS:</span>
                <span className="ml-2 font-medium">{health.system.memory.rss} MB</span>
              </div>
              <div className="text-sm">
                <span className="text-gray-500 dark:text-gray-400">External:</span>
                <span className="ml-2 font-medium">{health.system.memory.external} MB</span>
              </div>
              <div className="text-sm">
                <span className="text-gray-500 dark:text-gray-400">Last Updated:</span>
                <span className="ml-2 font-medium">
                  {new Date(health.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

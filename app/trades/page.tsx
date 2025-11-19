"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TradeStats } from "@/components/trades/TradeStats";
import { ActiveTradesTable } from "@/components/trades/ActiveTradesTable";
import { TradeHistoryTable } from "@/components/trades/TradeHistoryTable";
import { TradeFilters, TradeFilterValues } from "@/components/trades/TradeFilters";
import { Loader2, Activity, History, RefreshCw } from "lucide-react";
import { ITrade } from "@/types";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function TradesPage() {
  const [activeTrades, setActiveTrades] = useState<ITrade[]>([]);
  const [historyTrades, setHistoryTrades] = useState<ITrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeFilters, setActiveFilters] = useState<TradeFilterValues>({});
  const [historyFilters, setHistoryFilters] = useState<TradeFilterValues>({});

  useEffect(() => {
    fetchTrades();
  }, [activeFilters, historyFilters]);

  const fetchTrades = async () => {
    setLoading(true);
    try {
      // Fetch active trades (open + partial)
      const activePromise = fetchTradesWithFilters("open,partial", activeFilters);

      // Fetch history trades (closed + cancelled)
      const historyPromise = fetchTradesWithFilters("closed,cancelled", historyFilters);

      const [activeData, historyData] = await Promise.all([activePromise, historyPromise]);

      setActiveTrades(activeData);
      setHistoryTrades(historyData);
    } catch (error) {
      console.error("Error fetching trades:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTradesWithFilters = async (
    status: string,
    filters: TradeFilterValues
  ): Promise<ITrade[]> => {
    const params = new URLSearchParams({
      limit: "1000",
    });

    // Add status filter
    if (filters.status && filters.status !== "all") {
      params.append("status", filters.status);
    } else {
      params.append("status", status);
    }

    // Add symbol filter
    if (filters.symbol) {
      params.append("symbol", filters.symbol);
    }

    const response = await fetch(`/api/trades?${params.toString()}`);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error?.message || "Failed to fetch trades");
    }

    let trades: ITrade[] = data.data || [];

    // Apply client-side filters
    // P&L Filter
    if (filters.pnlFilter && filters.pnlFilter !== "all") {
      trades = trades.filter((trade) => {
        const pnl = trade.realizedPnL || trade.unrealizedPnL || 0;
        if (filters.pnlFilter === "positive") return pnl > 0;
        if (filters.pnlFilter === "negative") return pnl < 0;
        return true;
      });
    }

    // Close Reason Filter
    if (filters.closeReason && filters.closeReason !== "all") {
      trades = trades.filter((trade) => trade.closeReason === filters.closeReason);
    }

    // Date Range Filter
    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      trades = trades.filter((trade) => {
        const tradeDate = new Date(trade.createdAt);
        return tradeDate >= fromDate;
      });
    }

    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999); // End of day
      trades = trades.filter((trade) => {
        const tradeDate = new Date(trade.createdAt);
        return tradeDate <= toDate;
      });
    }

    return trades;
  };

  const handleActiveFilterChange = (filters: TradeFilterValues) => {
    setActiveFilters(filters);
  };

  const handleHistoryFilterChange = (filters: TradeFilterValues) => {
    setHistoryFilters(filters);
  };

  const handleSyncStatus = async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/trades/sync-status", {
        method: "POST",
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error?.message || "Failed to sync trade statuses");
      }

      toast.success(
        data.data.updatedCount > 0
          ? `${data.data.updatedCount} trade(s) status updated`
          : "All trade statuses are up to date"
      );

      // Refresh trades after sync
      await fetchTrades();
    } catch (error) {
      console.error("Error syncing trade statuses:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to sync trade statuses"
      );
    } finally {
      setSyncing(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Trades</h1>
            <p className="text-gray-600 mt-1">
              Manage your active positions and view trade history
            </p>
          </div>
          <Button
            onClick={handleSyncStatus}
            disabled={syncing}
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync Status"}
          </Button>
        </div>

        {/* Trade Statistics */}
        <TradeStats />

        {/* Main Content with Tabs */}
        <Tabs defaultValue="active" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="active" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Active Trades
              {activeTrades.length > 0 && (
                <span className="ml-1 px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full">
                  {activeTrades.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Trade History
              {historyTrades.length > 0 && (
                <span className="ml-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-800 rounded-full">
                  {historyTrades.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Active Trades Tab */}
          <TabsContent value="active" className="space-y-4">
            {/* Filters */}
            <TradeFilters
              onFilterChange={handleActiveFilterChange}
              initialFilters={activeFilters}
              statusOptions={[
                { value: "all", label: "All" },
                { value: "open", label: "Open" },
                { value: "partial", label: "Partial" },
              ]}
            />

            {/* Active Trades Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Active Positions
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                  </div>
                ) : activeTrades.length === 0 ? (
                  <div className="text-center py-12">
                    <Activity className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600 font-medium">No active trades</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Your open positions will appear here
                    </p>
                  </div>
                ) : (
                  <ActiveTradesTable trades={activeTrades} onTradeUpdated={fetchTrades} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Trade History Tab */}
          <TabsContent value="history" className="space-y-4">
            {/* Filters */}
            <TradeFilters
              onFilterChange={handleHistoryFilterChange}
              initialFilters={historyFilters}
              showCloseReason={true}
              statusOptions={[
                { value: "all", label: "All" },
                { value: "closed", label: "Closed" },
                { value: "cancelled", label: "Cancelled" },
              ]}
            />

            {/* Trade History Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Trade History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                  </div>
                ) : historyTrades.length === 0 ? (
                  <div className="text-center py-12">
                    <History className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600 font-medium">No trade history</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Closed trades will appear here
                    </p>
                  </div>
                ) : (
                  <TradeHistoryTable trades={historyTrades} onTradeUpdated={fetchTrades} />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

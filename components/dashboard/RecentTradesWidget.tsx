"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/utils/format";

interface TradeData {
  _id: string;
  symbol: string;
  side: string;
  entryPrice: number;
  quantity: number;
  realizedPnL?: number;
  status: string;
  createdAt: string;
}

export function RecentTradesWidget() {
  const [trades, setTrades] = useState<TradeData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTrades = async () => {
      try {
        const response = await fetch("/api/trades?limit=10");
        const data = await response.json();
        if (data.success) {
          setTrades(data.data || []);
        }
      } catch (error) {
        console.error("Error fetching recent trades:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTrades();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Recent Trades
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Recent Trades
        </CardTitle>
      </CardHeader>
      <CardContent>
        {trades.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No trades yet
          </p>
        ) : (
          <div className="space-y-3">
            {trades.map((trade) => (
              <div
                key={trade._id}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center gap-3">
                  {trade.realizedPnL !== undefined && trade.realizedPnL >= 0 ? (
                    <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-500" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-500" />
                  )}
                  <div>
                    <p className="font-medium text-foreground">{trade.symbol}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(trade.quantity, 4)} @ {formatCurrency(trade.entryPrice)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge
                    variant={
                      trade.status === "closed"
                        ? "secondary"
                        : trade.status === "open"
                        ? "default"
                        : "outline"
                    }
                  >
                    {trade.status}
                  </Badge>
                  {trade.realizedPnL !== undefined && (
                    <p
                      className={`text-sm font-medium mt-1 ${
                        trade.realizedPnL >= 0 ? "text-green-600 dark:text-green-500" : "text-red-600 dark:text-red-500"
                      }`}
                    >
                      {formatCurrency(trade.realizedPnL)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

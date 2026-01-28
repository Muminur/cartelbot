"use client";

import { useEffect, useState, useMemo, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { BarChart3 } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";

interface TradeData {
  _id: string;
  realizedPnL?: number;
  closedAt?: string;
}

interface ChartData {
  date: string;
  pnl: number;
  cumulative: number;
}

function PnLChartWidget() {
  const [trades, setTrades] = useState<TradeData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTrades = async () => {
      try {
        const response = await fetch("/api/trades?status=closed&limit=30");
        const data = await response.json();
        if (data.success && data.data.trades) {
          setTrades(data.data.trades);
        }
      } catch (error) {
        console.error("Error fetching trade history:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTrades();
  }, []);

  const chartData = useMemo(() => {
    if (!trades?.length) return [];

    return trades
      .filter((t) => t.realizedPnL !== undefined && t.closedAt)
      .sort((a, b) => new Date(a.closedAt!).getTime() - new Date(b.closedAt!).getTime())
      .reduce((acc: ChartData[], trade) => {
        const date = new Date(trade.closedAt!).toLocaleDateString();
        const pnl = trade.realizedPnL || 0;
        const cumulative = acc.length > 0 ? acc[acc.length - 1].cumulative + pnl : pnl;

        acc.push({ date, pnl, cumulative });
        return acc;
      }, []);
  }, [trades]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            P&L Chart
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
          <BarChart3 className="w-5 h-5" />
          P&L Chart
        </CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">
            No trade history available
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                labelStyle={{ color: "#000" }}
              />
              <Line
                type="monotone"
                dataKey="cumulative"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export default memo(PnLChartWidget);

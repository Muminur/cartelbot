"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { TrendingUp } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/utils/format";

interface TradeData {
  _id: string;
  symbol: string;
  side: string;
  entryPrice: number;
  quantity: number;
  currentPrice?: number;
  unrealizedPnL?: number;
  status: string;
}

export function OpenPositionsWidget() {
  const [trades, setTrades] = useState<TradeData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTrades = async () => {
      try {
        const response = await fetch("/api/trades?status=open");
        const data = await response.json();
        if (data.success) {
          setTrades(data.data.trades || []);
        }
      } catch (error) {
        console.error("Error fetching trades:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTrades();
  }, []);

  const columns: ColumnDef<TradeData>[] = [
    {
      accessorKey: "symbol",
      header: "Symbol",
    },
    {
      accessorKey: "side",
      header: "Side",
      cell: ({ row }) => (
        <Badge variant={row.original.side === "buy" ? "default" : "destructive"}>
          {row.original.side.toUpperCase()}
        </Badge>
      ),
    },
    {
      accessorKey: "entryPrice",
      header: "Entry",
      cell: ({ row }) => formatCurrency(row.original.entryPrice),
    },
    {
      accessorKey: "quantity",
      header: "Qty",
      cell: ({ row }) => formatNumber(row.original.quantity, 4),
    },
    {
      accessorKey: "unrealizedPnL",
      header: "P&L",
      cell: ({ row }) => {
        const pnl = row.original.unrealizedPnL || 0;
        return (
          <span className={pnl >= 0 ? "text-green-600" : "text-red-600"}>
            {formatCurrency(pnl)}
          </span>
        );
      },
    },
  ];

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Open Positions
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
          Open Positions
        </CardTitle>
      </CardHeader>
      <CardContent>
        {trades.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">
            No open positions
          </p>
        ) : (
          <DataTable columns={columns} data={trades} searchKey="symbol" />
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useState, useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Eye, XCircle, TrendingUp, TrendingDown } from "lucide-react";
import { formatCurrency, formatNumber, formatSymbol } from "@/lib/utils/format";
import { ITrade } from "@/types";
import { TradeDetailModal } from "./TradeDetailModal";
import { ClosePositionDialog } from "./ClosePositionDialog";
import { useLivePrices } from "@/hooks/useLivePrices";

interface ActiveTradesTableProps {
  trades: ITrade[];
  onTradeUpdated?: () => void;
}

export function ActiveTradesTable({ trades, onTradeUpdated }: ActiveTradesTableProps) {
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [tradeToClose, setTradeToClose] = useState<ITrade | null>(null);

  // Extract unique symbols from trades
  const symbols = useMemo(() => {
    return Array.from(new Set(trades.map((t) => t.symbol)));
  }, [trades]);

  // Fetch live prices for all symbols
  const { prices, getPrice, calculateUnrealizedPnL } = useLivePrices({
    symbols,
    enabled: symbols.length > 0,
    refreshInterval: 5000, // 5 seconds
  });

  const handleViewDetails = (tradeId: string) => {
    setSelectedTradeId(tradeId);
    setDetailModalOpen(true);
  };

  const handleClosePosition = (trade: ITrade) => {
    setTradeToClose(trade);
    setCloseDialogOpen(true);
  };

  const handlePositionClosed = () => {
    setTradeToClose(null);
    if (onTradeUpdated) {
      onTradeUpdated();
    }
  };

  const columns: ColumnDef<ITrade>[] = [
    {
      accessorKey: "symbol",
      header: "Symbol",
      cell: ({ row }) => {
        return (
          <div className="font-medium">
            {formatSymbol(row.original.symbol)}
          </div>
        );
      },
    },
    {
      accessorKey: "entryPrice",
      header: "Entry Price",
      cell: ({ row }) => {
        return formatCurrency(row.original.entryPrice);
      },
    },
    {
      id: "currentPrice",
      header: "Current Price",
      cell: ({ row }) => {
        const currentPrice = getPrice(row.original.symbol);
        return currentPrice ? formatCurrency(currentPrice) : (
          <span className="text-gray-400">Loading...</span>
        );
      },
    },
    {
      accessorKey: "quantity",
      header: "Quantity",
      cell: ({ row }) => {
        return formatNumber(row.original.quantity, 8);
      },
    },
    {
      accessorKey: "investedAmount",
      header: "Invested",
      cell: ({ row }) => {
        return formatCurrency(row.original.investedAmount);
      },
    },
    {
      id: "currentValue",
      header: "Current Value",
      cell: ({ row }) => {
        const currentPrice = getPrice(row.original.symbol);
        const currentValue = currentPrice ? currentPrice * row.original.quantity : 0;
        return currentPrice ? (
          formatCurrency(currentValue)
        ) : (
          <span className="text-gray-400">-</span>
        );
      },
    },
    {
      id: "unrealizedPnL",
      header: "Unrealized P&L",
      cell: ({ row }) => {
        const pnlData = calculateUnrealizedPnL(
          row.original.symbol,
          row.original.entryPrice,
          row.original.quantity
        );

        if (!pnlData) {
          return <span className="text-gray-400">-</span>;
        }

        const { pnl, pnlPercentage } = pnlData;

        return (
          <div className="text-right">
            <div className={`font-semibold ${pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
              {pnl >= 0 ? (
                <TrendingUp className="inline h-4 w-4 mr-1" />
              ) : (
                <TrendingDown className="inline h-4 w-4 mr-1" />
              )}
              {formatCurrency(pnl)}
            </div>
            <div className={`text-sm ${pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
              ({pnlPercentage >= 0 ? "+" : ""}{pnlPercentage.toFixed(2)}%)
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.status;
        const statusColors: Record<string, string> = {
          open: "bg-blue-100 text-blue-800",
          partial: "bg-yellow-100 text-yellow-800",
        };

        return (
          <Badge className={statusColors[status] || "bg-gray-100 text-gray-800"}>
            {status}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-12 w-12 md:h-8 md:w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-5 w-5 md:h-4 md:w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleViewDetails(String(row.original._id))}>
                <Eye className="mr-3 md:mr-2 h-5 w-5 md:h-4 md:w-4" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleClosePosition(row.original)}
                className="text-red-600"
              >
                <XCircle className="mr-3 md:mr-2 h-5 w-5 md:h-4 md:w-4" />
                Close Position
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={trades}
        searchKey="symbol"
        searchPlaceholder="Search by symbol..."
      />

      {/* Trade Detail Modal */}
      {selectedTradeId && (
        <TradeDetailModal
          open={detailModalOpen}
          onOpenChange={setDetailModalOpen}
          tradeId={selectedTradeId}
          onTradeUpdated={onTradeUpdated}
        />
      )}

      {/* Close Position Dialog */}
      {tradeToClose && (
        <ClosePositionDialog
          open={closeDialogOpen}
          onOpenChange={setCloseDialogOpen}
          trade={{
            _id: String(tradeToClose._id),
            symbol: tradeToClose.symbol,
            quantity: tradeToClose.quantity,
            entryPrice: tradeToClose.entryPrice,
            investedAmount: tradeToClose.investedAmount,
          }}
          currentPrice={getPrice(tradeToClose.symbol)}
          onClose={handlePositionClosed}
        />
      )}
    </>
  );
}

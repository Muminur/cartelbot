"use client";

import { useState } from "react";
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
import { MoreHorizontal, Eye, Download, TrendingUp, TrendingDown } from "lucide-react";
import { formatCurrency, formatNumber, formatSymbol, formatDate } from "@/lib/utils/format";
import { ITrade } from "@/types";
import { TradeDetailModal } from "./TradeDetailModal";
import { exportTradesToCSV } from "@/lib/utils/export";
import { toast } from "sonner";

interface TradeHistoryTableProps {
  trades: ITrade[];
  onTradeUpdated?: () => void;
}

export function TradeHistoryTable({ trades, onTradeUpdated }: TradeHistoryTableProps) {
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const handleViewDetails = (tradeId: string) => {
    setSelectedTradeId(tradeId);
    setDetailModalOpen(true);
  };

  const handleExportCSV = () => {
    try {
      exportTradesToCSV(trades);
      toast.success("Trades exported to CSV successfully");
    } catch (error) {
      console.error("Error exporting trades:", error);
      toast.error("Failed to export trades");
    }
  };

  const getCloseReasonColor = (reason?: string) => {
    switch (reason) {
      case "target":
        return "bg-green-100 text-green-800";
      case "stop_loss":
        return "bg-red-100 text-red-800";
      case "manual":
        return "bg-blue-100 text-blue-800";
      case "cancelled":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const columns: ColumnDef<ITrade>[] = [
    {
      id: "dateClosed",
      header: "Date Closed",
      cell: ({ row }) => {
        return (
          <div className="text-sm">
            {formatDate(row.original.updatedAt)}
          </div>
        );
      },
    },
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
      accessorKey: "exitPrice",
      header: "Exit Price",
      cell: ({ row }) => {
        return row.original.exitPrice
          ? formatCurrency(row.original.exitPrice)
          : <span className="text-gray-400">-</span>;
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
      id: "realizedPnL",
      header: "Realized P&L",
      cell: ({ row }) => {
        const pnl = row.original.realizedPnL || 0;
        const pnlPercentage =
          row.original.investedAmount > 0
            ? (pnl / row.original.investedAmount) * 100
            : 0;

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
      accessorKey: "closeReason",
      header: "Close Reason",
      cell: ({ row }) => {
        const reason = row.original.closeReason;
        const detail = row.original.closeReasonDetail;
        return reason || detail ? (
          <Badge className={getCloseReasonColor(reason || "")}>
            {detail || reason}
          </Badge>
        ) : (
          <span className="text-gray-400">-</span>
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
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <>
      <div className="space-y-4">
        {/* Export Button */}
        <div className="flex justify-end">
          <Button
            onClick={handleExportCSV}
            variant="outline"
            size="sm"
            disabled={trades.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            Export to CSV
          </Button>
        </div>

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={trades}
          searchKey="symbol"
          searchPlaceholder="Search by symbol..."
        />
      </div>

      {/* Trade Detail Modal */}
      {selectedTradeId && (
        <TradeDetailModal
          open={detailModalOpen}
          onOpenChange={setDetailModalOpen}
          tradeId={selectedTradeId}
          onTradeUpdated={onTradeUpdated}
        />
      )}
    </>
  );
}

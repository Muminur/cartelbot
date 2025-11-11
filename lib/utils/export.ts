import { ITrade } from "@/types";

export interface TradeExportData {
  date: string;
  symbol: string;
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  investedAmount: number;
  realizedPnL?: number;
  pnlPercentage?: number;
  closeReason?: string;
  status: string;
}

/**
 * Converts trades array to CSV string
 */
export function convertTradesToCSV(trades: ITrade[]): string {
  // CSV Headers
  const headers = [
    "Date",
    "Symbol",
    "Entry Price",
    "Exit Price",
    "Quantity",
    "Invested Amount",
    "P&L ($)",
    "P&L (%)",
    "Close Reason",
    "Status",
  ];

  // Convert trades to rows
  const rows = trades.map((trade) => {
    const date = trade.createdAt ? new Date(trade.createdAt).toLocaleDateString() : "N/A";
    const symbol = trade.symbol || "";
    const entryPrice = trade.entryPrice?.toFixed(8) || "0";
    const exitPrice = trade.exitPrice?.toFixed(8) || "";
    const quantity = trade.quantity?.toFixed(8) || "0";
    const investedAmount = trade.investedAmount?.toFixed(2) || "0";
    const realizedPnL = trade.realizedPnL !== undefined ? trade.realizedPnL.toFixed(2) : "";
    const pnlPercentage =
      trade.realizedPnL !== undefined && trade.investedAmount
        ? ((trade.realizedPnL / trade.investedAmount) * 100).toFixed(2)
        : "";
    const closeReason = trade.closeReason || "";
    const status = trade.status || "";

    return [
      date,
      symbol,
      entryPrice,
      exitPrice,
      quantity,
      investedAmount,
      realizedPnL,
      pnlPercentage,
      closeReason,
      status,
    ];
  });

  // Combine headers and rows
  const csvContent = [headers, ...rows]
    .map((row) =>
      row
        .map((cell) => {
          // Escape cells containing commas or quotes
          const cellString = String(cell);
          if (cellString.includes(",") || cellString.includes('"')) {
            return `"${cellString.replace(/"/g, '""')}"`;
          }
          return cellString;
        })
        .join(",")
    )
    .join("\n");

  return csvContent;
}

/**
 * Downloads CSV file in browser
 */
export function downloadCSV(csvContent: string, filename: string = "trades.csv"): void {
  // Create blob
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });

  // Create download link
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";

  // Trigger download
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Cleanup
  URL.revokeObjectURL(url);
}

/**
 * Export trades to CSV and download
 */
export function exportTradesToCSV(trades: ITrade[], filename?: string): void {
  const csvContent = convertTradesToCSV(trades);
  const defaultFilename = `trades_${new Date().toISOString().split("T")[0]}.csv`;
  downloadCSV(csvContent, filename || defaultFilename);
}

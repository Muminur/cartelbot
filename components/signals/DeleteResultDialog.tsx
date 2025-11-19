"use client";

import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Package, ExternalLink } from "lucide-react";

interface DeleteResultDialogProps {
  isOpen: boolean;
  onClose: () => void;
  result: {
    success: boolean;
    message: string;
    sellOrderId?: number;
    orphanedCoinId?: string;
    cancelledOCOs?: number[];
  } | null;
}

export default function DeleteResultDialog({
  isOpen,
  onClose,
  result,
}: DeleteResultDialogProps) {
  const router = useRouter();

  if (!result) return null;

  // Parse quantity and symbol from message
  // Messages look like:
  // "Signal deleted and 0.5 BNB sold at market price"
  // "Signal deleted. 0.5 BNB saved as orphaned coin."
  const parseQuantityAndSymbol = (message: string) => {
    const match = message.match(/([\d.]+)\s+([A-Z]+)/);
    if (match) {
      return {
        quantity: match[1],
        symbol: match[2],
      };
    }
    return null;
  };

  const isSellChoice = !!result.sellOrderId;
  const isKeepChoice = !!result.orphanedCoinId;
  const ocoCount = result.cancelledOCOs?.length || 0;
  const parsedData = parseQuantityAndSymbol(result.message);

  const handleViewOrphanedCoins = () => {
    router.push("/orphaned-coins");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] overflow-hidden p-0">
        {/* Header with gradient background */}
        <div
          className={`relative px-6 pt-6 pb-8 ${
            isSellChoice
              ? "bg-gradient-to-br from-green-50 via-emerald-50 to-green-100"
              : "bg-gradient-to-br from-blue-50 via-sky-50 to-blue-100"
          }`}
        >
          <DialogHeader>
            <DialogTitle className="flex flex-col items-center gap-4 text-center">
              {/* Animated icon */}
              <div
                className={`relative ${
                  isSellChoice
                    ? "bg-green-500"
                    : "bg-blue-500"
                } rounded-full p-3 animate-in zoom-in duration-300`}
              >
                {isSellChoice ? (
                  <CheckCircle2 className="h-8 w-8 text-white" />
                ) : (
                  <Package className="h-8 w-8 text-white" />
                )}
              </div>

              {/* Title */}
              <div>
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  {isSellChoice ? "Signal Deleted & Sold" : "Signal Deleted"}
                </h2>
                <p className="text-sm text-muted-foreground font-normal">
                  {isSellChoice
                    ? "Your remaining coins have been sold at market price"
                    : "Your coins are safely stored as orphaned assets"}
                </p>
              </div>
            </DialogTitle>
          </DialogHeader>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-6">
          {/* Main stats card */}
          {parsedData && (
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-4xl font-bold text-foreground">
                  {parsedData.quantity}
                </span>
                <span className="text-xl font-semibold text-muted-foreground">
                  {parsedData.symbol}
                </span>
              </div>
              <p className="text-center text-sm text-muted-foreground mt-2">
                {isSellChoice ? "Sold at market price" : "Saved to wallet"}
              </p>
            </div>
          )}

          {/* Details grid */}
          <div className="space-y-3">
            {/* OCO Orders Cancelled */}
            {ocoCount > 0 && (
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-muted-foreground">
                  OCO Orders Cancelled
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {ocoCount} {ocoCount === 1 ? "order" : "orders"}
                </span>
              </div>
            )}

            {/* Sell Order ID (for sell choice) */}
            {isSellChoice && result.sellOrderId && (
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-muted-foreground">Sell Order ID</span>
                <span className="text-sm font-mono font-semibold text-foreground">
                  {result.sellOrderId}
                </span>
              </div>
            )}

            {/* Orphaned Coin ID (for keep choice) */}
            {isKeepChoice && result.orphanedCoinId && (
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">Asset ID</span>
                <span className="text-sm font-mono text-foreground truncate max-w-[200px]">
                  {result.orphanedCoinId.slice(0, 8)}...
                  {result.orphanedCoinId.slice(-6)}
                </span>
              </div>
            )}
          </div>

          {/* Info box for orphaned coins */}
          {isKeepChoice && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex gap-3">
                <Package className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-blue-900 mb-1">
                    Coins saved to wallet
                  </h4>
                  <p className="text-xs text-blue-700 leading-relaxed">
                    Your {parsedData?.symbol || "coins"} are safely stored in
                    your Binance wallet. You can view and manage them from the
                    Orphaned Coins page.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Success confirmation for sell */}
          {isSellChoice && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-green-900 mb-1">
                    Trade closed successfully
                  </h4>
                  <p className="text-xs text-green-700 leading-relaxed">
                    All remaining {parsedData?.symbol || "coins"} have been sold
                    at the current market price. The funds are now available in
                    your USDT balance.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 pb-6 flex-col sm:flex-row gap-2">
          {isKeepChoice && (
            <Button
              variant="outline"
              onClick={handleViewOrphanedCoins}
              className="w-full sm:w-auto"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View Orphaned Coins
            </Button>
          )}
          <Button
            onClick={onClose}
            className={`w-full sm:w-auto ${
              isSellChoice
                ? "bg-green-600 hover:bg-green-700"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

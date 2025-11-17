"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatNumber, formatSymbol } from "@/lib/utils/format";

interface ClosePositionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trade: {
    _id: string;
    symbol: string;
    quantity: number;
    entryPrice: number;
    investedAmount: number;
  };
  currentPrice?: number;
  onClose: () => void;
}

export function ClosePositionDialog({
  open,
  onOpenChange,
  trade,
  currentPrice,
  onClose,
}: ClosePositionDialogProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);

  // Calculate estimated proceeds and P&L
  const estimatedProceeds = currentPrice ? currentPrice * trade.quantity : 0;
  const estimatedPnL = estimatedProceeds - trade.investedAmount;
  const estimatedPnLPercentage =
    trade.investedAmount > 0 ? (estimatedPnL / trade.investedAmount) * 100 : 0;

  const handleClose = async () => {
    if (!confirmed) {
      toast.error("Please confirm that you want to close this position");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/trades/close/${String(trade._id)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to close position");
      }

      toast.success("Position closed successfully");
      onOpenChange(false);
      setConfirmed(false);
      onClose();
    } catch (error) {
      console.error("Error closing position:", error);
      toast.error(error instanceof Error ? error.message : "Failed to close position");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setConfirmed(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Close Position</DialogTitle>
          <DialogDescription>
            Are you sure you want to manually close this position? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Trade Information */}
          <div className="rounded-lg bg-gray-50 p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Symbol</span>
              <span className="font-semibold text-lg">{formatSymbol(trade.symbol)}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Quantity</span>
              <span className="font-medium">{formatNumber(trade.quantity, 8)}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Entry Price</span>
              <span className="font-medium">{formatCurrency(trade.entryPrice)}</span>
            </div>

            {currentPrice && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Current Price</span>
                <span className="font-medium">{formatCurrency(currentPrice)}</span>
              </div>
            )}

            <div className="border-t pt-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Invested Amount</span>
                <span className="font-medium">{formatCurrency(trade.investedAmount)}</span>
              </div>

              {currentPrice && (
                <>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-sm text-gray-600">Estimated Proceeds</span>
                    <span className="font-medium">{formatCurrency(estimatedProceeds)}</span>
                  </div>

                  <div className="flex justify-between items-center mt-2">
                    <span className="text-sm text-gray-600">Estimated P&L</span>
                    <div className="text-right">
                      <div
                        className={`font-semibold ${
                          estimatedPnL >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {formatCurrency(estimatedPnL)}
                      </div>
                      <div
                        className={`text-sm ${
                          estimatedPnL >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        ({estimatedPnLPercentage >= 0 ? "+" : ""}
                        {estimatedPnLPercentage.toFixed(2)}%)
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Warning */}
          <div className="flex gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium mb-1">This will:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Cancel all pending OCO sell orders</li>
                <li>Execute a market sell order immediately</li>
                <li>Close your position permanently</li>
              </ul>
            </div>
          </div>

          {/* Confirmation Checkbox */}
          <div className="flex items-start space-x-2">
            <Checkbox
              id="confirm-close"
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked as boolean)}
            />
            <Label
              htmlFor="confirm-close"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              I understand that this action cannot be undone
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={loading} className="h-12 md:h-10 text-base md:text-sm">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleClose}
            disabled={!confirmed || loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Close Position
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

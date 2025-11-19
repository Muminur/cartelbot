"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, TrendingDown, Package } from "lucide-react";
import { ISignal } from "@/types";

interface DeleteSignalDialogProps {
  signal: ISignal | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (signalId: string, sellRemaining: boolean) => Promise<DeleteResult | void>;
}

interface DeleteResult {
  success: boolean;
  message: string;
  sellOrderId?: number;
  orphanedCoinId?: string;
  cancelledOCOs?: number[];
}

export default function DeleteSignalDialog({
  signal,
  isOpen,
  onClose,
  onConfirm,
}: DeleteSignalDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [choice, setChoice] = useState<"sell" | "keep" | null>(null);

  // Reset state when dialog opens or closes
  useEffect(() => {
    if (!isOpen) {
      setLoading(false);
      setChoice(null);
    }
  }, [isOpen]);

  if (!signal) return null;

  const handleConfirm = async () => {
    // Guard against double-clicks and missing choice
    if (!choice || loading) return;

    setLoading(true);
    try {
      // Call the parent's onConfirm (which will handle the API call)
      const result = await onConfirm(String(signal._id), choice === "sell");

      // If parent returned result data, redirect to result page
      if (result && result.success) {
        // Parse quantity and symbol from message with fallback
        // Messages look like:
        // "Signal deleted and 233.6 RAD sold at market price"
        // "Signal deleted. 233.6 RAD saved as orphaned coin."
        let quantity = "0";
        let symbol = signal.symbol; // Fallback to signal's symbol

        const match = result.message.match(/([\d.]+)\s+([A-Z]+)/);
        if (match) {
          quantity = match[1];
          symbol = match[2];
        } else {
          // Fallback: log warning if parsing fails
          console.warn("Failed to parse quantity/symbol from message:", result.message);
        }

        // Build URL parameters
        const params = new URLSearchParams({
          success: "true",
          choice: choice,
          quantity: quantity,
          symbol: symbol,
          message: result.message,
          ocoCount: String(result.cancelledOCOs?.length || 0),
        });

        if (result.sellOrderId) {
          params.append("sellOrderId", String(result.sellOrderId));
        }

        if (result.orphanedCoinId) {
          params.append("orphanedCoinId", result.orphanedCoinId);
        }

        // Close dialog
        setChoice(null);
        onClose();

        // Redirect to result page
        router.push(`/signals/delete-result?${params.toString()}`);
      } else {
        // If parent didn't return result (backward compatibility),
        // close normally
        setChoice(null);
        onClose();
      }
    } catch (error) {
      console.error("Error deleting signal:", error);
      // Keep the dialog open on error so user can see what happened
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setChoice(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Delete Signal
          </DialogTitle>
          <DialogDescription>
            Deleting this signal will cancel all open OCO orders for{" "}
            <span className="font-semibold">{signal.symbol}</span>.
            <br />
            What would you like to do with the remaining coins?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {/* Option 1: Sell at market price */}
          <button
            onClick={() => setChoice("sell")}
            disabled={loading}
            className={`w-full p-4 border-2 rounded-lg transition-all ${
              choice === "sell"
                ? "border-purple-500 bg-purple-50"
                : "border-gray-200 hover:border-purple-300"
            } ${loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <div className="flex items-start gap-3">
              <TrendingDown className="h-5 w-5 text-purple-600 mt-0.5" />
              <div className="flex-1 text-left">
                <h3 className="font-semibold text-foreground mb-1">
                  Sell remaining quantity at market price
                </h3>
                <p className="text-sm text-muted-foreground">
                  All remaining coins will be sold immediately at the current
                  market price. This will close the trade completely.
                </p>
              </div>
            </div>
          </button>

          {/* Option 2: Keep coins */}
          <button
            onClick={() => setChoice("keep")}
            disabled={loading}
            className={`w-full p-4 border-2 rounded-lg transition-all ${
              choice === "keep"
                ? "border-purple-500 bg-purple-50"
                : "border-gray-200 hover:border-purple-300"
            } ${loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <div className="flex items-start gap-3">
              <Package className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="flex-1 text-left">
                <h3 className="font-semibold text-foreground mb-1">
                  Keep coins but cancel OCO orders
                </h3>
                <p className="text-sm text-muted-foreground">
                  OCO orders will be cancelled, but coins will remain in your
                  wallet. You can sell them manually later from the &quot;Orphaned
                  Coins&quot; page.
                </p>
              </div>
            </div>
          </button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!choice || loading}
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Deleting...
              </>
            ) : (
              "Confirm Delete"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

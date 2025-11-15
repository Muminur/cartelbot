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
import { AlertTriangle, TrendingDown, Package } from "lucide-react";
import { ISignal } from "@/types";
import DeleteResultDialog from "./DeleteResultDialog";

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
  const [loading, setLoading] = useState(false);
  const [choice, setChoice] = useState<"sell" | "keep" | null>(null);
  const [deleteResult, setDeleteResult] = useState<DeleteResult | null>(null);
  const [showResultDialog, setShowResultDialog] = useState(false);

  if (!signal) return null;

  const handleConfirm = async () => {
    if (!choice) return;

    setLoading(true);
    try {
      // Call the parent's onConfirm (which will handle the API call)
      // The parent should return the result data
      const result = await onConfirm(String(signal._id), choice === "sell");

      // If parent returned result data, use it
      if (result) {
        // Store the result
        setDeleteResult(result);

        // Close the delete dialog
        setChoice(null);
        onClose();

        // Show the result dialog after a brief delay for smooth transition
        setTimeout(() => {
          setShowResultDialog(true);
        }, 300);
      } else {
        // If parent didn't return result (backward compatibility),
        // close normally without showing result dialog
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

  const handleResultDialogClose = () => {
    setShowResultDialog(false);
    setDeleteResult(null);
  };

  return (
    <>
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
                <h3 className="font-semibold text-gray-900 mb-1">
                  Sell remaining quantity at market price
                </h3>
                <p className="text-sm text-gray-600">
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
                <h3 className="font-semibold text-gray-900 mb-1">
                  Keep coins but cancel OCO orders
                </h3>
                <p className="text-sm text-gray-600">
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

    {/* Result Dialog */}
    <DeleteResultDialog
      isOpen={showResultDialog}
      onClose={handleResultDialogClose}
      result={deleteResult}
    />
    </>
  );
}

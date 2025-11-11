"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ParsedSignal } from "@/types";
import { formatPrice } from "@/lib/utils/format";
import { AlertTriangle, CheckCircle, TrendingUp, Target } from "lucide-react";

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  parsedSignal: ParsedSignal;
  isSubmitting?: boolean;
}

export default function ConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  parsedSignal,
  isSubmitting = false,
}: ConfirmationDialogProps) {
  const hasLowConfidence = parsedSignal.confidence < 80;
  const hasErrors = parsedSignal.errors.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Confirm Signal Submission</DialogTitle>
          <DialogDescription>
            Please review the parsed signal details before submission
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Confidence Score</span>
            <Badge
              variant={hasLowConfidence ? "destructive" : "default"}
              className={hasLowConfidence ? "bg-yellow-500" : "bg-green-500"}
            >
              {parsedSignal.confidence}%
            </Badge>
          </div>

          {hasLowConfidence && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-yellow-900">Low Confidence Warning</p>
                <p className="text-xs text-yellow-700">
                  The parser has low confidence ({parsedSignal.confidence}%) in this signal. Please
                  verify the extracted data is correct.
                </p>
              </div>
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Symbol</span>
            </div>
            <p className="text-xl font-bold ml-6">{parsedSignal.symbol || "N/A"}</p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Entry Prices</span>
            </div>
            <div className="flex flex-wrap gap-2 ml-6">
              {parsedSignal.entries.length > 0 ? (
                parsedSignal.entries.map((entry, i) => (
                  <Badge key={i} variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    {formatPrice(entry)}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-gray-500">None</span>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Target Prices</span>
            </div>
            <div className="flex flex-wrap gap-2 ml-6">
              {parsedSignal.targets.length > 0 ? (
                parsedSignal.targets.map((target, i) => (
                  <Badge key={i} variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    {formatPrice(target)}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-gray-500">None</span>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Stop Loss</span>
            </div>
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 ml-6">
              {parsedSignal.stopLoss ? formatPrice(parsedSignal.stopLoss) : "N/A"}
            </Badge>
          </div>

          {parsedSignal.currentMarketPrice && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Current Market Price</span>
              </div>
              <p className="text-lg font-semibold text-blue-600 ml-6">
                {formatPrice(parsedSignal.currentMarketPrice)}
              </p>
            </div>
          )}

          {hasErrors && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <span className="text-sm font-medium text-red-700">Parsing Issues</span>
                </div>
                <ul className="space-y-1 ml-6">
                  {parsedSignal.errors.map((error, i) => (
                    <li key={i} className="text-xs text-red-600 flex items-start gap-2">
                      <span className="text-red-400">•</span>
                      <span>{error}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : "Confirm & Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

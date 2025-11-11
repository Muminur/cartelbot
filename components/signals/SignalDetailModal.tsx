"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ISignal } from "@/types";
import { formatDate, formatPrice } from "@/lib/utils/format";
import {
  Clock,
  TrendingUp,
  Target,
  AlertTriangle,
  DollarSign,
  Image as ImageIcon,
  FileText,
  XCircle,
  Edit,
  Play,
} from "lucide-react";

interface SignalDetailModalProps {
  signal: ISignal | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (signal: ISignal) => void;
  onCancel?: (signalId: string) => void;
  onExecute?: (signal: ISignal) => void;
}

const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case "pending":
      return "default";
    case "parsed":
      return "secondary";
    case "executing":
      return "default";
    case "completed":
      return "default";
    case "failed":
      return "destructive";
    case "cancelled":
      return "outline";
    default:
      return "default";
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "pending":
      return "bg-yellow-500";
    case "parsed":
      return "bg-blue-500";
    case "executing":
      return "bg-purple-500";
    case "completed":
      return "bg-green-500";
    case "failed":
      return "bg-red-500";
    case "cancelled":
      return "bg-gray-500";
    default:
      return "bg-gray-500";
  }
};

export default function SignalDetailModal({
  signal,
  isOpen,
  onClose,
  onEdit,
  onCancel,
  onExecute,
}: SignalDetailModalProps) {
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);

  if (!signal) return null;

  const canEdit = signal.status === "pending";
  const canCancel = signal.status === "pending" || signal.status === "parsed";
  const canExecute = signal.status === "parsed";

  const handleEdit = () => {
    if (onEdit) {
      onEdit(signal);
      onClose();
    }
  };

  const handleCancel = async () => {
    if (!onCancel) return;

    setIsProcessing(true);
    try {
      await onCancel(String(signal._id));
      onClose();
    } catch (error) {
      console.error("Failed to cancel signal:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExecute = () => {
    if (onExecute) {
      onExecute(signal);
    } else {
      router.push(`/trades/execute?signalId=${signal._id}`);
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Signal Details</span>
            <Badge variant={getStatusBadgeVariant(signal.status)} className={getStatusColor(signal.status)}>
              {signal.status.toUpperCase()}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Created {formatDate(signal.createdAt)} • Updated {formatDate(signal.updatedAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <TrendingUp className="h-4 w-4" />
                <span>Symbol</span>
              </div>
              <p className="text-2xl font-bold">{signal.symbol}</p>
            </div>

            {signal.currentMarketPrice && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <DollarSign className="h-4 w-4" />
                  <span>Current Price</span>
                </div>
                <p className="text-2xl font-bold text-blue-600">
                  {formatPrice(signal.currentMarketPrice)}
                </p>
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Target className="h-4 w-4" />
              Entry Prices
            </div>
            <div className="flex flex-wrap gap-2">
              {signal.entries.map((entry, i) => (
                <Badge key={i} variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  {formatPrice(entry)}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <TrendingUp className="h-4 w-4" />
              Target Prices
            </div>
            <div className="flex flex-wrap gap-2">
              {signal.targets.map((target, i) => (
                <Badge key={i} variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  Target {i + 1}: {formatPrice(target)}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <AlertTriangle className="h-4 w-4" />
              Stop Loss
            </div>
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
              {formatPrice(signal.stopLoss)}
            </Badge>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              {signal.isImageSignal ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
              Signal Type: {signal.isImageSignal ? "Image" : "Text"}
            </div>

            {signal.imageUrl && (
              <div className="relative w-full max-h-64 overflow-hidden rounded-lg border">
                <Image
                  src={signal.imageUrl}
                  alt="Signal image"
                  width={800}
                  height={400}
                  className="w-full h-auto object-contain"
                />
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Raw Signal:</p>
              <pre className="bg-gray-50 p-3 rounded-lg text-xs overflow-x-auto border">
                {signal.rawSignal}
              </pre>
            </div>
          </div>

          {signal.parseErrors && signal.parseErrors.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-red-700">
                  <AlertTriangle className="h-4 w-4" />
                  Parsing Issues
                </div>
                <ul className="space-y-1">
                  {signal.parseErrors.map((error, i) => (
                    <li key={i} className="text-sm text-red-600 flex items-start gap-2">
                      <span className="text-red-400">•</span>
                      <span>{error}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          <Separator />

          <div className="flex flex-wrap gap-2">
            {canEdit && onEdit && (
              <Button onClick={handleEdit} variant="outline" disabled={isProcessing}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Signal
              </Button>
            )}

            {canExecute && (
              <Button onClick={handleExecute} disabled={isProcessing}>
                <Play className="mr-2 h-4 w-4" />
                Execute Trade
              </Button>
            )}

            {canCancel && onCancel && (
              <Button
                onClick={handleCancel}
                variant="destructive"
                disabled={isProcessing}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Cancel Signal
              </Button>
            )}

            <Button onClick={onClose} variant="outline" disabled={isProcessing} className="ml-auto">
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

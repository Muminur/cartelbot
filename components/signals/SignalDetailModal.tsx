"use client";

import { useState, useEffect } from "react";
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
import { ISignal, ITrade, IOrder } from "@/types";
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
  ListOrdered,
  RefreshCw,
} from "lucide-react";

// Constants for polling configuration
const MAX_POLLING_ATTEMPTS = 10;
const POLLING_INTERVAL_MS = 3000;

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
  const [trade, setTrade] = useState<ITrade | null>(null);
  const [loadingTrade, setLoadingTrade] = useState(false);
  const [pollingAttempts, setPollingAttempts] = useState(0);
  const [pollingFailed, setPollingFailed] = useState(false);

  // Reset polling attempts when modal is closed or signal changes
  useEffect(() => {
    if (!isOpen) {
      setPollingAttempts(0);
      setPollingFailed(false);
      setTrade(null);
    }
  }, [isOpen, signal?._id]);

  // Fetch trade data when signal is executing or completed
  useEffect(() => {
    // FIX #2: Prevent concurrent fetches with abort controller
    const abortController = new AbortController();
    let isMounted = true;
    let timeoutId: NodeJS.Timeout | null = null;

    const fetchTradeData = async () => {
      if (!signal || !isOpen) return;
      if (signal.status !== "executing" && signal.status !== "completed") return;

      // Prevent concurrent fetch requests
      if (loadingTrade) return;

      setLoadingTrade(true);
      try {
        // Fetch trades associated with this signal
        const response = await fetch(`/api/trades?signalId=${signal._id}`, {
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch trade data: ${response.statusText}`);
        }

        const data = await response.json();

        // Only update state if component is still mounted
        if (!isMounted) return;

        if (data.success && data.data && data.data.length > 0) {
          // Get the most recent trade for this signal
          const latestTrade = data.data[0];
          setTrade(latestTrade);

          // If trade exists but has no OCO orders yet, poll again after 3 seconds
          // This handles the race condition where OCO orders are still being created
          // Limit to MAX_POLLING_ATTEMPTS (30 seconds total) to prevent infinite loop
          if (
            latestTrade &&
            latestTrade.sellOrders.length === 0 &&
            signal.status === "executing" &&
            pollingAttempts < MAX_POLLING_ATTEMPTS
          ) {
            // FIX #1: Store timeout ID for cleanup
            timeoutId = setTimeout(() => {
              if (isMounted) {
                setPollingAttempts((prev) => prev + 1);
              }
            }, POLLING_INTERVAL_MS);
          } else if (
            latestTrade &&
            latestTrade.sellOrders.length === 0 &&
            signal.status === "executing" &&
            pollingAttempts >= MAX_POLLING_ATTEMPTS
          ) {
            // FIX ENHANCEMENT #1: Set polling failed state after max attempts
            console.warn(
              `Failed to load OCO orders after ${MAX_POLLING_ATTEMPTS} attempts (${(MAX_POLLING_ATTEMPTS * POLLING_INTERVAL_MS) / 1000} seconds)`
            );
            setPollingFailed(true);
          }
        }
      } catch (error) {
        // Only log error if not an abort error
        if (error instanceof Error && error.name !== "AbortError") {
          console.error("Failed to fetch trade data:", error);
        }
      } finally {
        // Only update state if component is still mounted
        if (isMounted) {
          setLoadingTrade(false);
        }
      }
    };

    fetchTradeData();

    // FIX #1: Cleanup function to clear timeout and abort fetch
    return () => {
      isMounted = false;
      abortController.abort();
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
    // FIX #3: Use signal._id instead of full signal object to prevent infinite loops
    // FIX #4: Removed loadingTrade from dependencies - it's a guard, not a trigger
    //         Having it in dependencies causes the effect to re-run when setLoadingTrade(true) is called,
    //         but the guard check (line 120) prevents execution, leaving loadingTrade stuck at true
  }, [signal?._id, isOpen, pollingAttempts]);

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

          {/* OCO Order Details - Show when signal is executing or completed */}
          {(signal.status === "executing" || signal.status === "completed") && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <ListOrdered className="h-4 w-4" />
                  Trade Execution Details
                </div>

                {loadingTrade ? (
                  <div className="text-sm text-gray-500 flex items-center gap-2">
                    <Clock className="h-4 w-4 animate-spin" />
                    Loading trade details...
                  </div>
                ) : trade ? (
                  <div className="space-y-4">
                    {/* Buy Order */}
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                      <div className="text-xs font-semibold text-blue-900 mb-2">BUY ORDER</div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-gray-600">Order ID:</span>
                          <span className="ml-2 font-mono text-blue-700">{trade.buyOrder.orderId}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Status:</span>
                          <Badge className="ml-2" variant={trade.buyOrder.status === "FILLED" ? "default" : "secondary"}>
                            {trade.buyOrder.status}
                          </Badge>
                        </div>
                        <div>
                          <span className="text-gray-600">Quantity:</span>
                          <span className="ml-2 font-medium">{trade.buyOrder.quantity.toFixed(6)}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Invested:</span>
                          <span className="ml-2 font-medium">${trade.investedAmount.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* OCO Sell Orders - or loading state */}
                    {trade.sellOrders && trade.sellOrders.length > 0 ? (
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-gray-700">OCO SELL ORDERS (Take Profit & Stop Loss)</div>
                        {trade.sellOrders.map((order: IOrder, index: number) => (
                          <div key={order.orderId} className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-gray-700">
                                {order.stopPrice ? `Stop Loss Order` : `Take Profit #${index + 1}`}
                              </span>
                              <Badge
                                variant={
                                  order.status === "FILLED" ? "default" :
                                  order.status === "CANCELED" ? "outline" :
                                  "secondary"
                                }
                                className={
                                  order.status === "FILLED" ? "bg-green-500" :
                                  order.status === "CANCELED" ? "bg-gray-400" :
                                  "bg-yellow-500"
                                }
                              >
                                {order.status}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-gray-600">Order ID:</span>
                                <span className="ml-2 font-mono">{order.orderId}</span>
                              </div>
                              <div>
                                <span className="text-gray-600">Quantity:</span>
                                <span className="ml-2">{order.quantity.toFixed(6)}</span>
                              </div>
                              {order.price && (
                                <div>
                                  <span className="text-gray-600">Target Price:</span>
                                  <span className="ml-2 font-medium text-green-700">${formatPrice(order.price)}</span>
                                </div>
                              )}
                              {order.stopPrice && (
                                <div>
                                  <span className="text-gray-600">Stop Price:</span>
                                  <span className="ml-2 font-medium text-red-700">${formatPrice(order.stopPrice)}</span>
                                </div>
                              )}
                              {order.executedQty > 0 && (
                                <div>
                                  <span className="text-gray-600">Executed:</span>
                                  <span className="ml-2">{order.executedQty.toFixed(6)}</span>
                                </div>
                              )}
                              {order.cummulativeQuoteQty > 0 && (
                                <div>
                                  <span className="text-gray-600">Filled Value:</span>
                                  <span className="ml-2 font-medium">${order.cummulativeQuoteQty.toFixed(2)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : signal.status === "executing" ? (
                      pollingFailed ? (
                        // FIX ENHANCEMENT #1: Show error after max polling attempts with manual refresh option
                        <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                          <div className="flex items-center gap-2 text-sm text-red-800">
                            <AlertTriangle className="h-4 w-4" />
                            <span className="font-medium">OCO orders taking longer than expected</span>
                          </div>
                          <p className="text-xs text-red-700 mt-2">
                            The system has been waiting for {(MAX_POLLING_ATTEMPTS * POLLING_INTERVAL_MS) / 1000} seconds but OCO orders haven&apos;t appeared yet. This could indicate a Binance API delay or connectivity issue.
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-3 border-red-300 text-red-700 hover:bg-red-100"
                            onClick={() => {
                              setPollingFailed(false);
                              setPollingAttempts(0);
                            }}
                          >
                            <RefreshCw className="h-3 w-3 mr-2" />
                            Retry Loading Orders
                          </Button>
                        </div>
                      ) : (
                        <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                          <div className="flex items-center gap-2 text-sm text-yellow-800">
                            <Clock className="h-4 w-4 animate-spin" />
                            <span className="font-medium">Creating OCO orders (Take Profit & Stop Loss)...</span>
                          </div>
                          <p className="text-xs text-yellow-700 mt-2">
                            This may take a few seconds. The orders will appear automatically when ready. (Attempt {pollingAttempts + 1}/{MAX_POLLING_ATTEMPTS})
                          </p>
                        </div>
                      )
                    ) : null}

                    {/* Trade Summary */}
                    <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-3 rounded-lg border border-purple-200">
                      <div className="text-xs font-semibold text-purple-900 mb-2">TRADE SUMMARY</div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-gray-600">Trade Status:</span>
                          <Badge className="ml-2" variant="default">
                            {trade.status.toUpperCase()}
                          </Badge>
                        </div>
                        <div>
                          <span className="text-gray-600">Entry Price:</span>
                          <span className="ml-2 font-medium">${formatPrice(trade.entryPrice)}</span>
                        </div>
                        {trade.exitPrice && (
                          <div>
                            <span className="text-gray-600">Exit Price:</span>
                            <span className="ml-2 font-medium">${formatPrice(trade.exitPrice)}</span>
                          </div>
                        )}
                        {trade.realizedPnL !== undefined && trade.realizedPnL !== null && (
                          <div>
                            <span className="text-gray-600">Realized P&L:</span>
                            <span className={`ml-2 font-bold ${trade.realizedPnL >= 0 ? "text-green-600" : "text-red-600"}`}>
                              ${trade.realizedPnL.toFixed(2)} ({((trade.realizedPnL / trade.investedAmount) * 100).toFixed(2)}%)
                            </span>
                          </div>
                        )}
                        {trade.closeReason && (
                          <div>
                            <span className="text-gray-600">Close Reason:</span>
                            <Badge className="ml-2" variant={trade.closeReason === "stop_loss" ? "destructive" : "default"}>
                              {trade.closeReason.replace("_", " ").toUpperCase()}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">No trade data available for this signal.</div>
                )}
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

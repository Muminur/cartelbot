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
  CheckCircle2,
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

  // Live price state
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [priceError, setPriceError] = useState<string | null>(null);

  // Reset polling attempts when modal is closed or signal changes
  useEffect(() => {
    if (!isOpen) {
      setPollingAttempts(0);
      setPollingFailed(false);
      setTrade(null);
      setLivePrice(null);
      setPriceChange(0);
      setPriceError(null);
    }
  }, [isOpen, signal?._id]);

  // Fetch live price on modal open and every 5 seconds
  useEffect(() => {
    if (!isOpen || !signal?.symbol) return;

    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;
    let abortController: AbortController | null = null;

    const fetchLivePrice = async () => {
      // Cancel previous fetch if still running
      if (abortController) {
        abortController.abort();
      }

      abortController = new AbortController();
      setPriceLoading(true);

      try {
        const response = await fetch(
          `/api/binance/ticker?symbol=${signal.symbol}`,
          { signal: abortController.signal }
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch price: ${response.statusText}`);
        }

        const data = await response.json();

        // Only update state if still mounted
        if (isMounted && data.success && data.data?.price) {
          const newPrice = parseFloat(data.data.price);

          // Only update if value changed (prevents unnecessary re-renders)
          setLivePrice(prev => prev !== newPrice ? newPrice : prev);

          // Reset error state on successful fetch
          setPriceError(null);

          // Calculate price change from creation
          if (signal.currentMarketPrice) {
            const newChange =
              ((newPrice - signal.currentMarketPrice) /
                signal.currentMarketPrice) *
              100;

            // Only update if value changed (prevents unnecessary re-renders)
            setPriceChange(prev => {
              const roundedNew = parseFloat(newChange.toFixed(2));
              const roundedPrev = parseFloat(prev.toFixed(2));
              return roundedNew !== roundedPrev ? newChange : prev;
            });
          }
        }
      } catch (error) {
        // Ignore abort errors (expected when component unmounts)
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        if (isMounted) {
          console.error("Failed to fetch live price:", error);
          setPriceError("Unable to fetch live price");
        }
      } finally {
        if (isMounted) {
          setPriceLoading(false);
        }
      }
    };

    // Initial fetch
    fetchLivePrice();

    // Set up interval for auto-refresh (every 5 seconds)
    intervalId = setInterval(fetchLivePrice, 5000);

    // Cleanup
    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
      if (abortController) abortController.abort();
    };
  }, [signal?.symbol, signal?.currentMarketPrice, isOpen]);

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

  // Helper function to check which targets were filled
  const getFilledTargets = (): Set<number> => {
    if (!trade || !trade.sellOrders) return new Set();

    const filled = new Set<number>();
    trade.sellOrders.forEach((order: IOrder) => {
      if (order.status === "FILLED" && order.type === "LIMIT_MAKER" && order.price) {
        // Find which target index this matches
        signal.targets.forEach((target, index) => {
          if (Math.abs(order.price! - target) < 0.0001) {
            // Floating point comparison
            filled.add(index);
          }
        });
      }
    });

    return filled;
  };

  // Helper to check if stop loss was hit
  const isStopLossHit = (): boolean => {
    if (!trade || !trade.sellOrders) return false;
    return trade.sellOrders.some(
      (order: IOrder) =>
        order.status === "FILLED" && order.type === "STOP_LOSS_LIMIT"
    );
  };

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

            {/* Live Price with change indicator */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <DollarSign className="h-4 w-4" />
                <span>Current Price</span>
                {priceLoading && <Clock className="h-3 w-3 animate-spin" />}
              </div>
              {priceError ? (
                <p className="text-sm text-red-500 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  {priceError}
                </p>
              ) : livePrice ? (
                <div className="space-y-1">
                  <p className="text-2xl font-bold text-blue-600">
                    {formatPrice(livePrice)}
                  </p>
                  {signal.currentMarketPrice && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500">
                        Created at: {formatPrice(signal.currentMarketPrice)}
                      </span>
                      <Badge
                        variant={priceChange >= 0 ? "default" : "destructive"}
                        className={
                          priceChange >= 0 ? "bg-green-500" : "bg-red-500"
                        }
                      >
                        {priceChange >= 0 ? "+" : ""}
                        {priceChange.toFixed(2)}%
                      </Badge>
                    </div>
                  )}
                </div>
              ) : signal.currentMarketPrice ? (
                <p className="text-2xl font-bold text-gray-400">
                  {formatPrice(signal.currentMarketPrice)}
                </p>
              ) : null}
            </div>
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <TrendingUp className="h-4 w-4" />
                Target Prices
              </div>
              {trade && (
                <Badge variant="outline" className="text-xs">
                  {getFilledTargets().size}/{signal.targets.length} Hit
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {signal.targets.map((target, i) => {
                const isFilled = getFilledTargets().has(i);
                return (
                  <div key={i} className="flex items-center gap-1">
                    <Badge
                      variant="outline"
                      className={
                        isFilled
                          ? "bg-green-100 text-green-800 border-green-300"
                          : "bg-green-50 text-green-700 border-green-200"
                      }
                    >
                      Target {i + 1}: {formatPrice(target)}
                    </Badge>
                    {isFilled && (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <AlertTriangle className="h-4 w-4" />
              Stop Loss
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                {formatPrice(signal.stopLoss)}
              </Badge>
              {isStopLossHit() && (
                <>
                  <Badge variant="destructive" className="bg-red-600">
                    HIT
                  </Badge>
                  <AlertTriangle className="h-5 w-5 text-red-600 animate-pulse" />
                </>
              )}
            </div>
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

          {/* OCO Order Details - Show when signal is executing, completed, or failed */}
          {(signal.status === "executing" || signal.status === "completed" || signal.status === "failed") && (
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

                    {/* OCO Sell Orders - or loading state - or failure */}
                    {signal.status === "failed" ? (
                      <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                        <div className="flex items-center gap-2 text-sm text-red-800 font-semibold">
                          <AlertTriangle className="h-4 w-4" />
                          <span>OCO Order Creation Failed</span>
                        </div>
                        <p className="text-xs text-red-700 mt-2">
                          The buy order was executed successfully, but the sell orders (OCO - Take Profit & Stop Loss) could not be created. This is usually because:
                        </p>
                        <ul className="text-xs text-red-700 mt-2 ml-4 space-y-1 list-disc">
                          <li><strong>Target prices are below the executed buy price</strong> (market moved up before execution)</li>
                          <li>Insufficient balance after buy order settlement</li>
                          <li>Binance API connectivity issues</li>
                        </ul>
                        <p className="text-xs text-red-700 mt-2 font-medium">
                          ⚠️ Your position is OPEN but has NO STOP LOSS protection. You should manually close this trade or set stop loss orders via Binance directly.
                        </p>
                      </div>
                    ) : trade.sellOrders && trade.sellOrders.length > 0 ? (
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-gray-700">OCO SELL ORDERS (Take Profit & Stop Loss)</div>
                        {trade.sellOrders.map((order: IOrder, index: number) => (
                          <div key={order.orderId} className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-gray-700">
                                {order.type === 'STOP_LOSS_LIMIT' ? 'Stop Loss' : `Take Profit #${Math.floor(index / 2) + 1}`}
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

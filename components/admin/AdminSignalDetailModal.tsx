"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { AdminSignal, ITrade, IOrder, BinanceOCOResponse, BinanceOCOOrderReport } from "@/types";
import { formatDate, formatPrice } from "@/lib/utils/format";
import { safeJsonParse } from "@/lib/utils/api";
import { ErrorDetailCard } from "@/components/signals/ErrorDetailCard";
import {
  Clock,
  TrendingUp,
  Target,
  AlertTriangle,
  DollarSign,
  Image as ImageIcon,
  FileText,
  ListOrdered,
  RefreshCw,
  User,
  Info,
} from "lucide-react";

// Constants for polling configuration
const PRICE_REFRESH_INTERVAL_MS = 5000;
const OCO_STATUS_REFRESH_INTERVAL_MS = 10000;
const TARGET_PRICE_TOLERANCE_PERCENT = 0.001;

interface AdminSignalDetailModalProps {
  signal: AdminSignal | null;
  isOpen: boolean;
  onClose: () => void;
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

export default function AdminSignalDetailModal({
  signal,
  isOpen,
  onClose,
}: AdminSignalDetailModalProps) {
  const [trade, setTrade] = useState<ITrade | null>(null);
  const [loadingTrade, setLoadingTrade] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [priceNetwork, setPriceNetwork] = useState<"testnet" | "mainnet" | null>(null);
  const [ocoStatuses, setOcoStatuses] = useState<Map<number, BinanceOCOResponse>>(new Map());

  // Use ref to track the fetchOCOStatuses function to avoid recreating intervals
  const fetchOCOStatusesRef = useRef<(() => Promise<void>) | null>(null);

  // Reset state when modal is closed or signal changes
  useEffect(() => {
    if (!isOpen) {
      setTrade(null);
      setLivePrice(null);
      setPriceChange(0);
      setPriceError(null);
      setPriceNetwork(null);
      setOcoStatuses(new Map());
    }
  }, [isOpen, signal?._id]);

  // Fetch live price on modal open and every 5 seconds
  useEffect(() => {
    if (!isOpen || !signal?.symbol) return;

    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;
    let abortController: AbortController | null = null;
    let fetchTimeoutId: NodeJS.Timeout | null = null;

    const fetchLivePrice = async () => {
      // Check if mounted BEFORE aborting or creating new requests
      if (!isMounted) return;

      if (abortController) {
        abortController.abort();
      }

      if (fetchTimeoutId) {
        clearTimeout(fetchTimeoutId);
      }

      abortController = new AbortController();

      setPriceLoading(true);

      fetchTimeoutId = setTimeout(() => {
        abortController?.abort();
      }, 20000);

      try {
        const response = await fetch(
          `/api/binance/ticker?symbol=${signal.symbol}`,
          { signal: abortController.signal }
        );

        if (fetchTimeoutId) {
          clearTimeout(fetchTimeoutId);
          fetchTimeoutId = null;
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 50)}`);
        }

        const data = await safeJsonParse<{
          success: boolean;
          data?: { price?: string; lastPrice?: string; network?: "testnet" | "mainnet" };
          error?: { message: string };
        }>(response, 'Admin Signal Detail - Live Price');

        if (isMounted && data.success && data.data) {
          const priceValue = data.data.price || data.data.lastPrice;

          if (priceValue) {
            const newPrice = parseFloat(priceValue);
            setLivePrice(prev => prev !== newPrice ? newPrice : prev);

            if (data.data.network) {
              setPriceNetwork(data.data.network);
            }

            setPriceError(null);

            if (signal.currentMarketPrice) {
              const newChange =
                ((newPrice - signal.currentMarketPrice) /
                  signal.currentMarketPrice) *
                100;

              setPriceChange(prev => {
                const roundedNew = parseFloat(newChange.toFixed(2));
                const roundedPrev = parseFloat(prev.toFixed(2));
                return roundedNew !== roundedPrev ? newChange : prev;
              });
            }
          }
        }
      } catch (error) {
        if (fetchTimeoutId) {
          clearTimeout(fetchTimeoutId);
          fetchTimeoutId = null;
        }

        if (error instanceof Error && error.name === 'AbortError') {
          if (isMounted) {
            setPriceError("Request timed out, please refresh");
          }
          return;
        }

        if (isMounted) {
          setPriceError("Unable to fetch live price");
        }
      } finally {
        if (isMounted) {
          setPriceLoading(false);
        }
      }
    };

    fetchLivePrice();
    intervalId = setInterval(fetchLivePrice, PRICE_REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
      if (fetchTimeoutId) clearTimeout(fetchTimeoutId);
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
    };
  }, [signal?.symbol, signal?.currentMarketPrice, isOpen]);

  // Fetch trade data when signal is executing or completed
  useEffect(() => {
    if (!isOpen || !signal) return;

    if (
      signal.status !== "executing" &&
      signal.status !== "completed" &&
      signal.status !== "failed"
    ) {
      return;
    }

    const fetchTradeData = async () => {
      setLoadingTrade(true);
      setTradeError(null);
      try {
        const response = await fetch(`/api/admin/trades?signalId=${signal._id}`);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: Failed to fetch trade data`);
        }

        const data = await safeJsonParse<{
          success: boolean;
          data?: ITrade[];
          error?: { message: string };
        }>(response, 'Admin Signal Detail - Trade Data');

        if (data.success && data.data && data.data.length > 0) {
          setTrade(data.data[0]);
          setTradeError(null);
        } else if (data.error) {
          setTradeError(data.error.message);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to load trade data";
        setTradeError(errorMessage);
        if (process.env.NODE_ENV === "development") {
          console.error("[AdminSignalDetailModal] Error fetching trade:", error);
        }
      } finally {
        setLoadingTrade(false);
      }
    };

    fetchTradeData();
  }, [signal?._id, signal?.status, isOpen]);

  // Fetch OCO statuses from Binance API
  const fetchOCOStatuses = useCallback(async () => {
    if (!trade || !trade.sellOrders || trade.sellOrders.length === 0) return;

    try {
      const orderListIds = Array.from(
        new Set(
          trade.sellOrders
            .filter((order: IOrder) => order.orderListId && order.orderListId !== -1)
            .map((order: IOrder) => order.orderListId)
        )
      );

      if (orderListIds.length === 0) {
        return;
      }

      const promises = orderListIds.map(async (orderListId) => {
        try {
          const response = await fetch(
            `/api/trades/orders/status?orderListId=${orderListId}`
          );

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: Failed to fetch OCO status`);
          }

          const data = await safeJsonParse<{
            success: boolean;
            data?: BinanceOCOResponse;
            error?: { message: string };
          }>(response, `Admin Signal Detail - OCO ${orderListId}`);

          if (data.success && data.data) {
            return { orderListId, status: data.data };
          }
          return null;
        } catch (error) {
          if (process.env.NODE_ENV === "development") {
            console.error(`[AdminSignalDetailModal] Error fetching OCO ${orderListId}:`, error);
          }
          return null;
        }
      });

      const results = await Promise.all(promises);
      const newStatuses = new Map<number, BinanceOCOResponse>();

      results.forEach((result) => {
        if (result && result.orderListId) {
          newStatuses.set(result.orderListId, result.status);
        }
      });

      setOcoStatuses(newStatuses);
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[AdminSignalDetailModal] Error fetching OCO statuses:", error);
      }
    }
  }, [trade?.sellOrders]);

  // Store the function in ref to avoid recreating intervals
  useEffect(() => {
    fetchOCOStatusesRef.current = fetchOCOStatuses;
  }, [fetchOCOStatuses]);

  // Fetch OCO statuses when trade data loads - FIXED: interval cleanup
  useEffect(() => {
    if (!trade || !trade.sellOrders || trade.sellOrders.length === 0) return;

    let isMounted = true;
    let interval: NodeJS.Timeout | null = null;

    const safeFetch = async () => {
      if (!isMounted) return;
      // Use ref to get latest function without recreating interval
      if (fetchOCOStatusesRef.current) {
        await fetchOCOStatusesRef.current();
      }
    };

    // Initial fetch
    safeFetch();

    const hasActiveOrders = trade.sellOrders.some(
      (order: IOrder) => order.status === "NEW" || order.status === "PARTIALLY_FILLED"
    );

    // Only set interval for active orders
    if (trade.status === "open" && hasActiveOrders) {
      // Clear any existing interval before creating new one
      if (interval) clearInterval(interval);
      interval = setInterval(safeFetch, OCO_STATUS_REFRESH_INTERVAL_MS);
    }

    return () => {
      isMounted = false;
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };
  }, [trade?.status, trade?.sellOrders?.length]);
  // Removed fetchOCOStatuses from deps to prevent interval recreation

  if (!signal) return null;

  // Optimized: Use useMemo to prevent recalculating filled targets on every render
  // Pre-build a Map for O(1) lookups instead of nested loops (O(n²))
  const filledTargets = useMemo((): Set<number> => {
    if (!trade || !trade.sellOrders || !signal.targets) return new Set();

    const filled = new Set<number>();

    // Build a Map of orderId -> BinanceOCOOrderReport for O(1) lookups
    const orderReportMap = new Map<number, BinanceOCOOrderReport>();
    ocoStatuses.forEach((ocoStatus) => {
      ocoStatus.orderReports?.forEach((report) => {
        orderReportMap.set(report.orderId, report);
      });
    });

    // Single pass through sellOrders
    trade.sellOrders.forEach((order: IOrder) => {
      const realOrderStatus = orderReportMap.get(order.orderId);
      const displayStatus = realOrderStatus?.status || order.status;

      if (displayStatus === "FILLED" && order.type === "LIMIT_MAKER" && order.price) {
        const orderPrice = order.price;

        // Find matching target (still O(n) but unavoidable for target matching)
        signal.targets.forEach((target, index) => {
          const tolerance = target * TARGET_PRICE_TOLERANCE_PERCENT;
          if (Math.abs(orderPrice - target) <= tolerance) {
            filled.add(index + 1);
          }
        });
      }
    });

    return filled;
  }, [trade?.sellOrders, ocoStatuses, signal.targets]);
  // Dependencies: recalculate only when trade orders, OCO statuses, or targets change

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-3 w-3 rounded-full ${getStatusColor(signal.status)}`} />
              <DialogTitle className="text-foreground dark:text-white">Signal Details (Admin View)</DialogTitle>
            </div>
            <Badge variant={getStatusBadgeVariant(signal.status)}>
              {signal.status.toUpperCase()}
            </Badge>
          </div>
          <DialogDescription className="text-muted-foreground dark:text-gray-400">
            Viewing signal details as administrator
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* User Information - Admin Only */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-center gap-2 text-sm font-medium text-blue-900 dark:text-blue-300 mb-2">
              <User className="h-4 w-4" />
              <span>User Information</span>
            </div>
            <p className="text-sm text-blue-700 dark:text-blue-400">
              Email: <span className="font-semibold">
                {signal.userEmail && typeof signal.userEmail === 'string' ? signal.userEmail : "N/A"}
              </span>
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-500 mt-1">
              User ID: {signal.userId}
            </p>
          </div>

          {/* Symbol and Price */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground dark:text-gray-400">
                <TrendingUp className="h-4 w-4" />
                <span>Symbol</span>
              </div>
              <p className="text-2xl font-bold text-foreground dark:text-white">{signal.symbol}</p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground dark:text-gray-400">
                <DollarSign className="h-4 w-4" />
                <span>Current Price</span>
                {priceLoading && <Clock className="h-3 w-3 animate-spin" />}
                {priceNetwork && (
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      priceNetwork === "testnet"
                        ? "bg-orange-100 border-orange-300 text-orange-700 dark:bg-orange-900/30 dark:border-orange-700 dark:text-orange-400"
                        : "bg-green-100 border-green-300 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400"
                    }`}
                  >
                    {priceNetwork.toUpperCase()}
                  </Badge>
                )}
              </div>
              {priceError ? (
                <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                  <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  <p className="text-sm text-red-600 dark:text-red-400 flex-1">{priceError}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setPriceError(null);
                      setLivePrice(null);
                    }}
                    className="h-6 px-2 text-xs"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Retry
                  </Button>
                </div>
              ) : livePrice !== null ? (
                <div className="space-y-1">
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    ${formatPrice(livePrice)}
                  </p>
                  {signal.currentMarketPrice && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground dark:text-gray-400">
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
                <p className="text-2xl font-bold text-muted-foreground/60">
                  {formatPrice(signal.currentMarketPrice)}
                </p>
              ) : null}
            </div>
          </div>

          <Separator />

          {/* Entry Prices */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground dark:text-white">
              <Target className="h-4 w-4" />
              Entry Prices
              {trade?.buyOrder?.fills && trade.buyOrder.fills.length > 0 && (
                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700">
                  Executed
                </Badge>
              )}
              {!trade && (
                <Badge variant="outline" className="text-xs bg-gray-50 text-gray-600 border-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600">
                  Estimated
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {trade?.buyOrder?.fills && trade.buyOrder.fills.length > 0 ? (
                trade.buyOrder.fills.map((fill, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <Badge variant="default" className="bg-green-600 text-white">
                      ${parseFloat(fill.price).toFixed(4)}
                    </Badge>
                    <span className="text-xs text-muted-foreground dark:text-gray-400 text-center">
                      {parseFloat(fill.qty).toFixed(6)} {signal.symbol.replace('USDT', '')}
                    </span>
                  </div>
                ))
              ) : (
                signal.entries.map((entry, i) => (
                  <Badge key={i} variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700">
                    {formatPrice(entry)}
                  </Badge>
                ))
              )}
            </div>
          </div>

          {/* Targets */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground dark:text-white">
              <ListOrdered className="h-4 w-4" />
              Take Profit Targets
              {filledTargets.size > 0 && (
                <Badge className="bg-green-500 text-white">
                  {filledTargets.size}/{signal.targets.length} Hit
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {signal.targets.map((target, i) => {
                const isFilled = filledTargets.has(i + 1);
                return (
                  <Badge
                    key={i}
                    variant={isFilled ? "default" : "outline"}
                    className={
                      isFilled
                        ? "bg-green-500 text-white"
                        : "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-700"
                    }
                  >
                    TP {i + 1}: {formatPrice(target)}
                  </Badge>
                );
              })}
            </div>
          </div>

          {/* Stop Loss */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground dark:text-white">
              <AlertTriangle className="h-4 w-4" />
              Stop Loss
            </div>
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-700">
              {formatPrice(signal.stopLoss)}
            </Badge>
          </div>

          <Separator />

          {/* Signal Type */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground dark:text-white">
              {signal.isImageSignal ? (
                <ImageIcon className="h-4 w-4" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              Signal Type
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={signal.isImageSignal ? "default" : "secondary"}>
                {signal.isImageSignal ? "Image Signal" : "Text Signal"}
              </Badge>
              {signal.isImageSignal && signal.confidence && (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700">
                  Confidence: {signal.confidence.toFixed(1)}%
                </Badge>
              )}
            </div>
            {signal.isImageSignal && signal.imageUrl && (
              <div className="mt-2 border rounded-lg overflow-hidden">
                <Image
                  src={signal.imageUrl}
                  alt="Signal Image"
                  width={400}
                  height={300}
                  className="w-full h-auto"
                />
              </div>
            )}
          </div>

          {/* Raw Signal */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground dark:text-white">
              <FileText className="h-4 w-4" />
              Raw Signal Text
            </div>
            <pre className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm overflow-x-auto border border-gray-200 dark:border-gray-700">
              <code className="text-gray-700 dark:text-gray-300">{signal.rawSignal}</code>
            </pre>
          </div>

          {/* Metadata */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground dark:text-white">
              <Clock className="h-4 w-4" />
              Timeline
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground dark:text-gray-400">Created</p>
                <p className="font-medium text-foreground dark:text-white">{formatDate(signal.createdAt)}</p>
              </div>
              <div>
                <p className="text-muted-foreground dark:text-gray-400">Last Updated</p>
                <p className="font-medium text-foreground dark:text-white">{formatDate(signal.updatedAt)}</p>
              </div>
            </div>
          </div>

          {/* Errors (if any) */}
          {(signal.parseErrors && signal.parseErrors.length > 0) ||
          signal.executionError ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
                Errors
              </div>
              {signal.parseErrors && signal.parseErrors.length > 0 && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <h4 className="font-semibold text-red-800 dark:text-red-300 mb-2">Parse Errors:</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-red-700 dark:text-red-400">
                    {signal.parseErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
              {signal.executionError && (
                <ErrorDetailCard
                  error={signal.executionError}
                  errorCode={signal.executionErrorCode}
                  timestamp={signal.executionErrorTimestamp}
                  failureReason={signal.failureReason}
                />
              )}
            </div>
          ) : null}

          {/* Trade Information */}
          {loadingTrade && (
            <div className="flex items-center justify-center py-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
            </div>
          )}

          {tradeError && !loadingTrade && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-2 text-sm font-medium text-red-800 dark:text-red-300 mb-2">
                <AlertTriangle className="h-4 w-4" />
                <span>Failed to Load Trade Data</span>
              </div>
              <p className="text-sm text-red-700 dark:text-red-400">{tradeError}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setTradeError(null);
                  // Trigger refetch by updating a dependency
                  const fetchTradeData = async () => {
                    setLoadingTrade(true);
                    setTradeError(null);
                    try {
                      const response = await fetch(`/api/admin/trades?signalId=${signal._id}`);
                      if (!response.ok) throw new Error("Failed to fetch trade data");
                      const data = await safeJsonParse<{ success: boolean; data?: ITrade[] }>(
                        response,
                        'Admin Signal Detail - Trade Data Retry'
                      );
                      if (data.success && data.data && data.data.length > 0) {
                        setTrade(data.data[0]);
                        setTradeError(null);
                      }
                    } catch (error) {
                      setTradeError(error instanceof Error ? error.message : "Failed to load trade data");
                    } finally {
                      setLoadingTrade(false);
                    }
                  };
                  fetchTradeData();
                }}
                className="mt-2 h-7 px-3 text-xs"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Retry
              </Button>
            </div>
          )}

          {trade && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground dark:text-white">
                <Info className="h-4 w-4" />
                Trade Information
              </div>
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground dark:text-gray-400">Trade ID:</span>
                  <span className="font-mono text-xs text-foreground dark:text-white">{String(trade._id)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground dark:text-gray-400">Status:</span>
                  <Badge variant={trade.status === "closed" ? "default" : "secondary"}>
                    {trade.status.toUpperCase()}
                  </Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground dark:text-gray-400">Network:</span>
                  <Badge variant="outline" className={trade.testnet ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"}>
                    {trade.testnet ? "Testnet" : "Mainnet"}
                  </Badge>
                </div>
                {trade.realizedPnL !== undefined && trade.status === "closed" && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground dark:text-gray-400">P&L:</span>
                    <span className={`font-semibold ${trade.realizedPnL >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                      ${trade.realizedPnL.toFixed(2)} ({trade.realizedPnL >= 0 ? "+" : ""}{((trade.realizedPnL / (trade.investedAmount || 1)) * 100).toFixed(2)}%)
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
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
import { ISignal, ITrade, IOrder, BinanceOCOResponse, BinanceOCOOrderReport } from "@/types";
import { formatDate, formatPrice } from "@/lib/utils/format";
import { ErrorDetailCard } from "@/components/signals/ErrorDetailCard";
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

// FIX M1: Extract tolerance constant to avoid magic number
const TARGET_PRICE_TOLERANCE_PERCENT = 0.001; // 0.1% tolerance for price matching

// CRITICAL FIX #1: Extract magic numbers to named constants
const PNL_UPDATE_TOLERANCE = 0.000001; // 6 decimal places (USDT precision)
const PRICE_REFRESH_INTERVAL_MS = 5000; // 5 seconds
const OCO_STATUS_REFRESH_INTERVAL_MS = 10000; // 10 seconds

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

// Helper function to calculate P&L from order data
// This serves as a fallback when database P&L is incorrect
const calculatePnLFromOrders = (trade: ITrade | null): { pnl: number; percentage: number } | null => {
  if (!trade || !trade.buyOrder || !trade.sellOrders) {
    return null;
  }

  // Get filled sell orders
  const filledOrders = trade.sellOrders.filter(
    (order: IOrder) => order.status === "FILLED"
  );

  if (filledOrders.length === 0) {
    return null;
  }

  // Calculate P&L using cummulativeQuoteQty (actual USDT spent/received from Binance)
  const buyCost = trade.buyOrder.cummulativeQuoteQty || 0;
  const sellRevenue = filledOrders.reduce(
    (sum: number, order: IOrder) => sum + (order.cummulativeQuoteQty || 0),
    0
  );

  if (buyCost === 0) {
    return null; // Avoid division by zero
  }

  const pnl = sellRevenue - buyCost;
  // CRITICAL FIX #1: Division by Zero Protection
  const percentage = trade.investedAmount > 0
    ? (pnl / trade.investedAmount) * 100
    : 0;

  return { pnl, percentage };
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
  const [priceNetwork, setPriceNetwork] = useState<"testnet" | "mainnet" | null>(null);

  // OCO status state - stores real-time status from Binance API
  const [ocoStatuses, setOcoStatuses] = useState<Map<number, BinanceOCOResponse>>(new Map());
  const [fetchingOcoStatus, setFetchingOcoStatus] = useState(false);

  // Reset polling attempts when modal is closed or signal changes
  useEffect(() => {
    if (!isOpen) {
      setPollingAttempts(0);
      setPollingFailed(false);
      setTrade(null);
      setLivePrice(null);
      setPriceChange(0);
      setPriceError(null);
      setPriceNetwork(null);
      setOcoStatuses(new Map());
      setFetchingOcoStatus(false);
    }
  }, [isOpen, signal?._id]);

  // Fetch live price on modal open and every 5 seconds
  useEffect(() => {
    if (!isOpen || !signal?.symbol) return;

    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;
    let abortController: AbortController | null = null;

    const fetchLivePrice = async () => {
      // Fix #4: Cancel previous fetch if still running
      if (abortController) {
        abortController.abort();
      }

      abortController = new AbortController();

      if (!isMounted) return;

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
        if (isMounted && data.success && data.data) {
          // Binance returns lastPrice, not price
          const priceValue = data.data.price || data.data.lastPrice;

          if (priceValue) {
            const newPrice = parseFloat(priceValue);

            if (process.env.NODE_ENV === "development") {
              // eslint-disable-next-line no-console
              console.log("[SignalDetailModal] Live price fetched:", {
                symbol: signal.symbol,
                price: newPrice,
                network: data.data.network,
              });
            }

            // Only update if value changed (prevents unnecessary re-renders)
            setLivePrice(prev => prev !== newPrice ? newPrice : prev);

            // Capture network from response
            if (data.data.network) {
              setPriceNetwork(data.data.network);
            }

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
        }
      } catch (error) {
        // Ignore abort errors (expected when component unmounts)
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        if (isMounted) {
          if (process.env.NODE_ENV === "development") {
            console.error("[SignalDetailModal] Price fetch failed:", {
              symbol: signal.symbol,
              error: error instanceof Error ? error.message : String(error),
              timestamp: new Date().toISOString(),
            });
          }
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

    // Set up interval for auto-refresh using named constant
    intervalId = setInterval(fetchLivePrice, PRICE_REFRESH_INTERVAL_MS);

    // Cleanup
    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
      if (abortController) {
        abortController.abort();
        abortController = null; // Clear reference (Fix #4)
      }
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

  // Fetch real-time OCO status from Binance API (NOT computed from market prices)
  const fetchOCOStatuses = useCallback(async () => {
    if (!trade || !trade.sellOrders || trade.sellOrders.length === 0) return;

    // Extract unique orderListIds from sell orders
    const orderListIds = new Set(
      trade.sellOrders
        .map((order: IOrder) => order.orderListId)
        .filter((id): id is number => id !== undefined)
    );

    if (orderListIds.size === 0) return;

    setFetchingOcoStatus(true);

    try {
      // NEW: Fetch individual order statuses from Binance API
      const ordersToCheck = trade.sellOrders
        .filter((order: IOrder) => order.orderListId !== undefined)
        .map((order: IOrder) => ({
          symbol: trade.symbol,
          orderId: order.orderId,
          orderListId: order.orderListId!,
        }));

      if (ordersToCheck.length > 0) {
        try {
          const orderStatusResponse = await fetch("/api/trades/orders/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orders: ordersToCheck }),
          });

          const orderStatusData = await orderStatusResponse.json();

          if (orderStatusData.success && orderStatusData.data?.orders) {
            // Update trade.sellOrders with real-time statuses from Binance
            const updatedSellOrders = trade.sellOrders.map((order: IOrder) => {
              const liveStatus = orderStatusData.data.orders.find(
                (o: any) => o.orderId === order.orderId
              );

              if (liveStatus && liveStatus.status !== "NOT_FOUND" && liveStatus.status !== "ERROR") {
                return {
                  ...order,
                  status: liveStatus.status, // Update with real FILLED/CANCELED status
                  executedQty: parseFloat(liveStatus.executedQty || "0"),
                  cummulativeQuoteQty: parseFloat(liveStatus.cummulativeQuoteQty || "0"), // ✅ CRITICAL: Actual USDT value from Binance
                };
              }

              return order;
            });

            // CRITICAL FIX #4: Fix race condition in state updates
            // Use functional setState to prevent race condition when updating sellOrders
            setTrade((prevTrade) => {
              if (!prevTrade) return prevTrade;
              return {
                ...prevTrade,
                sellOrders: updatedSellOrders,
              } as ITrade;
            });

            // NEW: Check if all take profit targets are FILLED
            const takeProfitOrders = updatedSellOrders.filter(
              (order: IOrder) => order.type === "LIMIT_MAKER"
            );

            // Track which specific targets were filled
            const filledTargetNumbers: number[] = [];
            takeProfitOrders.forEach((order: IOrder, index: number) => {
              const liveStatus = orderStatusData.data.orders.find(
                (o: any) => o.orderId === order.orderId
              );
              if (liveStatus?.status === "FILLED") {
                // TP #1 = index 0, so add 1 to get display number
                filledTargetNumbers.push(index + 1);
              }
            });

            const allTargetsFilled = takeProfitOrders.length > 0 &&
              takeProfitOrders.every((order: IOrder) => {
                const liveStatus = orderStatusData.data.orders.find(
                  (o: any) => o.orderId === order.orderId
                );
                return liveStatus?.status === "FILLED";
              });

            // Check if stop loss was triggered
            const stopLossOrders = updatedSellOrders.filter(
              (order: IOrder) => order.type === "STOP_LOSS_LIMIT"
            );
            const stopLossTriggered = stopLossOrders.some((order: IOrder) => {
              const liveStatus = orderStatusData.data.orders.find(
                (o: any) => o.orderId === order.orderId
              );
              return liveStatus?.status === "FILLED";
            });

            // If all targets filled OR stop loss triggered, update signal status in database
            if ((allTargetsFilled || stopLossTriggered) && signal && signal.status === "executing") {
              // Calculate exit price and P&L
              let exitPrice: number | undefined;
              let realizedPnL: number | undefined;

              const filledOrders = updatedSellOrders.filter((order: IOrder) => {
                const liveStatus = orderStatusData.data.orders.find(
                  (o: any) => o.orderId === order.orderId
                );
                return liveStatus?.status === "FILLED";
              });

              if (filledOrders.length > 0) {
                // CRITICAL FIX #2: Add null coalescing for cummulativeQuoteQty to prevent division by zero
                // Get actual buy cost from Binance (what was actually spent)
                const buyCost = trade.buyOrder.cummulativeQuoteQty || 0;

                // Get actual sell revenue from filled orders (what was actually received)
                const sellRevenue = filledOrders.reduce(
                  (sum: number, order: IOrder) => sum + (order.cummulativeQuoteQty || 0),
                  0
                );

                const totalExecutedQty = filledOrders.reduce(
                  (sum: number, order: IOrder) => sum + order.executedQty,
                  0
                );

                if (totalExecutedQty > 0) {
                  // Weighted average exit price
                  exitPrice = sellRevenue / totalExecutedQty;

                  // FIX: Realized P&L = Sell Revenue - Buy Cost (both from Binance API, not user input)
                  realizedPnL = sellRevenue - buyCost;
                }
              }

              // Call API to update signal and trade status
              try {
                const updateResponse = await fetch(`/api/signals/${signal._id}/update-status`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    allTargetsFilled,
                    stopLossTriggered,
                    tradeId: String(trade._id),
                    exitPrice,
                    realizedPnL,
                    filledTargetNumbers,  // NEW: Send which specific targets were filled
                  }),
                });

                const updateData = await updateResponse.json();

                if (updateData.success && updateData.data.updated) {
                  console.log("[SignalDetailModal] Signal and trade status updated:", {
                    signalId: signal._id,
                    tradeId: trade._id,
                    newSignalStatus: updateData.data.signal.status,
                    newTradeStatus: updateData.data.trade.status,
                    allTargetsFilled,
                    stopLossTriggered,
                  });

                  // Trigger page refresh to show updated status
                  // The parent component will re-fetch signal data
                  window.location.reload();
                }
              } catch (updateError) {
                console.error("[SignalDetailModal] Failed to update signal status:", updateError);
              }
            }
          }
        } catch (individualOrderError) {
          console.error("Failed to fetch individual order statuses:", individualOrderError);
          // Continue with OCO status fetch even if individual fetch fails
        }
      }

      // Existing OCO status fetch by orderListId
      const statusPromises = Array.from(orderListIds).map(async (orderListId) => {
        try {
          const response = await fetch(
            `/api/trades/oco-status/${orderListId}?testnet=${trade.testnet || false}`
          );
          const data = await response.json();

          if (data.success) {
            return [orderListId, data.data] as const;
          }
          return null;
        } catch (error) {
          console.error(`Failed to fetch OCO status for ${orderListId}:`, error);
          return null;
        }
      });

      const results = await Promise.all(statusPromises);
      const newStatuses = new Map(
        results.filter((r): r is [number, BinanceOCOResponse] => r !== null)
      );

      setOcoStatuses(newStatuses);
    } catch (error) {
      console.error("Error fetching OCO statuses:", error);
    } finally {
      setFetchingOcoStatus(false);
    }
  }, [trade, signal]);

  // Recalculate P&L for trades with incorrect values (old bug fix)
  useEffect(() => {
    if (!trade || !signal) return;

    // Check if this is a closed trade with potentially incorrect P&L
    // The old bug stored P&L as -investedAmount, but we need to recalculate for ALL closed trades
    // to ensure correctness, especially if database has stale values
    const shouldRecalculatePnL =
      trade.status === "closed" &&
      trade.buyOrder?.cummulativeQuoteQty !== undefined &&
      trade.buyOrder?.cummulativeQuoteQty > 0 &&
      trade.sellOrders?.some((order: IOrder) => order.status === "FILLED");

    if (!shouldRecalculatePnL) return;

    console.log("[SignalDetailModal] Recalculating P&L for closed trade:", {
      tradeId: trade._id,
      currentPnL: trade.realizedPnL,
      investedAmount: trade.investedAmount,
      buyOrderCummulative: trade.buyOrder?.cummulativeQuoteQty,
    });

    // Recalculate P&L from actual order data
    const recalculatePnL = async () => {
      try {
        // Get filled orders
        const filledOrders = trade.sellOrders.filter(
          (order: IOrder) => order.status === "FILLED"
        );

        if (filledOrders.length === 0) {
          console.warn("[SignalDetailModal] No filled orders found for closed trade");
          return;
        }

        // CRITICAL FIX: Use cummulativeQuoteQty from Binance API (actual USDT spent/received)
        // This is the ACTUAL amount, not calculated from quantity * price
        const buyCost = trade.buyOrder.cummulativeQuoteQty || 0;
        const sellRevenue = filledOrders.reduce(
          (sum: number, order: IOrder) => sum + (order.cummulativeQuoteQty || 0),
          0
        );

        const correctPnL = sellRevenue - buyCost;

        console.log("[SignalDetailModal] P&L Calculation:", {
          buyCost: buyCost.toFixed(6),
          sellRevenue: sellRevenue.toFixed(6),
          filledOrdersCount: filledOrders.length,
          filledOrderDetails: filledOrders.map((order: IOrder) => ({
            orderId: order.orderId,
            status: order.status,
            cummulativeQuoteQty: order.cummulativeQuoteQty,
          })),
          calculatedPnL: correctPnL.toFixed(6),
          storedPnL: trade.realizedPnL?.toFixed(6) || "null",
          needsUpdate: Math.abs(correctPnL - (trade.realizedPnL || 0)) > 0.000001,
        });

        // CRITICAL FIX #2: Race Condition Protection
        // Check if update is needed BEFORE any async operations to prevent infinite loops
        const needsUpdate = Math.abs(correctPnL - (trade.realizedPnL || 0)) > PNL_UPDATE_TOLERANCE;

        if (!needsUpdate) {
          console.log("[SignalDetailModal] P&L already correct, skipping update");
          return; // Early exit before any async operations
        }

        // Update trade in database
        const response = await fetch(`/api/trades/${trade._id}/update-pnl`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ realizedPnL: correctPnL }),
        });

        if (response.ok) {
          // Update local state with corrected P&L
          setTrade((prevTrade) => {
            if (!prevTrade) return prevTrade;
            return {
              ...prevTrade,
              realizedPnL: correctPnL,
            } as ITrade;
          });
          console.log("[SignalDetailModal] P&L updated successfully:", {
            oldValue: trade.realizedPnL,
            newValue: correctPnL,
          });
        } else {
          const errorData = await response.json();
          console.error("[SignalDetailModal] Failed to update P&L in database:", {
            status: response.status,
            error: errorData,
          });
        }
      } catch (error) {
        console.error("[SignalDetailModal] Error recalculating P&L:", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    };

    recalculatePnL();
  }, [trade?._id, trade?.status, trade?.realizedPnL, signal?._id]);

  // Fetch OCO statuses from Binance API when trade data loads
  useEffect(() => {
    if (!trade || !trade.sellOrders || trade.sellOrders.length === 0) return;

    let isMounted = true;
    let interval: NodeJS.Timeout | null = null;

    const safeFetch = async () => {
      if (!isMounted) return;
      await fetchOCOStatuses();
    };

    // Initial fetch
    safeFetch();

    // Auto-refresh for open trades with active orders
    const hasActiveOrders = trade.sellOrders.some(
      (order: IOrder) => order.status === "NEW" || order.status === "PARTIALLY_FILLED"
    );

    if (trade.status === "open" && hasActiveOrders) {
      interval = setInterval(safeFetch, OCO_STATUS_REFRESH_INTERVAL_MS);
    }

    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
    };
  }, [trade?.status, trade?.sellOrders?.length, fetchOCOStatuses]);

  if (!signal) return null;

  const canEdit = signal.status === "pending";
  const canCancel = signal.status === "pending" || signal.status === "parsed";
  const canExecute = signal.status === "parsed";

  // Helper function to check which targets were filled
  const getFilledTargets = (): Set<number> => {
    if (!trade || !trade.sellOrders) return new Set();

    const filled = new Set<number>();

    // Count how many LIMIT_MAKER (take profit) orders are FILLED
    let filledTpCount = 0;

    trade.sellOrders.forEach((order: IOrder) => {
      // FIX: Use real-time status from Binance API if available, fallback to database
      const ocoStatus = order.orderListId ? ocoStatuses.get(order.orderListId) : null;
      const realOrderStatus = ocoStatus?.orderReports?.find(
        (report: BinanceOCOOrderReport) => report.orderId === order.orderId
      );
      const displayStatus = realOrderStatus?.status || order.status;

      // Count FILLED LIMIT_MAKER orders (take profit targets)
      if (displayStatus === "FILLED" && order.type === "LIMIT_MAKER") {
        filledTpCount++;

        // Try to match this order to a specific target price
        // Use price from Binance API if available, fallback to database price
        const orderPrice = realOrderStatus?.price
          ? parseFloat(realOrderStatus.price)
          : order.price;

        if (orderPrice) {
          // FIX H3: Add null check for signal.targets array
          if (signal.targets && Array.isArray(signal.targets)) {
            signal.targets.forEach((target, index) => {
              // FIX M1: Use constant instead of magic number
              const tolerance = target * TARGET_PRICE_TOLERANCE_PERCENT;
              if (Math.abs(orderPrice - target) <= tolerance) {
                filled.add(index);
              }
            });
          }
        }
      }
    });

    // FIX: If we have filled TP orders but couldn't match them to specific targets,
    // assume targets were hit in order (Target 1, Target 2, etc.)
    if (filledTpCount > 0 && filled.size === 0) {
      console.warn(`[getFilledTargets] ${filledTpCount} TP orders filled but couldn't match to targets. Assuming sequential fill.`);
      for (let i = 0; i < Math.min(filledTpCount, signal.targets.length); i++) {
        filled.add(i);
      }
    }

    return filled;
  };

  // Helper to check if stop loss was hit
  const isStopLossHit = (): boolean => {
    if (!trade || !trade.sellOrders) return false;
    return trade.sellOrders.some((order: IOrder) => {
      // FIX: Use real-time status from Binance API if available
      const ocoStatus = order.orderListId ? ocoStatuses.get(order.orderListId) : null;
      const realOrderStatus = ocoStatus?.orderReports?.find(
        (report: BinanceOCOOrderReport) => report.orderId === order.orderId
      );
      const displayStatus = realOrderStatus?.status || order.status;

      return displayStatus === "FILLED" && order.type === "STOP_LOSS_LIMIT";
    });
  };

  // Helper to get trade close details (which TP hit or SL hit)
  const getTradeCloseDetails = (): {
    closeType: "take_profit" | "stop_loss" | null;
    targetNumbers: number[];
    exitPrice: number | null;
    pnlPercentage: number | null;
  } => {
    if (!trade || !trade.sellOrders || signal.status !== "completed") {
      return { closeType: null, targetNumbers: [], exitPrice: null, pnlPercentage: null };
    }

    // FIX BUG 1: Use Set to prevent duplicate target numbers
    const filledTargetsSet = new Set<number>();
    let stopLossTriggered = false;
    let averageExitPrice = 0;
    let totalExitValue = 0;
    let totalQuantity = 0;

    // Check ALL orders to find which targets were filled
    for (const order of trade.sellOrders) {
      const ocoStatus = order.orderListId ? ocoStatuses.get(order.orderListId) : null;
      const realOrderStatus = ocoStatus?.orderReports?.find(
        (report: BinanceOCOOrderReport) => report.orderId === order.orderId
      );
      const displayStatus = realOrderStatus?.status || order.status;
      const executedQty = realOrderStatus?.executedQty
        ? parseFloat(realOrderStatus.executedQty)
        : order.executedQty;

      if (displayStatus === "FILLED" && executedQty > 0) {
        if (order.type === "STOP_LOSS_LIMIT") {
          // Stop loss hit
          stopLossTriggered = true;
          const exitPrice = order.stopPrice || 0;
          totalExitValue += exitPrice * executedQty;
          totalQuantity += executedQty;
        } else if (order.type === "LIMIT_MAKER" && order.price) {
          // Take profit hit - find which target
          // FIX H3: Add null check for signal.targets array
          if (signal.targets && Array.isArray(signal.targets)) {
            // Store order price in const for type safety
            const orderPrice = order.price;
            signal.targets.forEach((target, index) => {
              // FIX M1: Use constant instead of magic number
              const tolerance = target * TARGET_PRICE_TOLERANCE_PERCENT;
              // FIX L3: Use orderPrice const instead of order.price (type-safe)
              if (Math.abs(orderPrice - target) <= tolerance) {
                // FIX BUG 1: Use Set.add() instead of Array.push() to prevent duplicates
                filledTargetsSet.add(index + 1); // Store 1-based target number
              }
            });
          }

          const exitPrice = order.price;
          totalExitValue += exitPrice * executedQty;
          totalQuantity += executedQty;
        }
      }
    }

    // Calculate weighted average exit price
    if (totalQuantity > 0) {
      averageExitPrice = totalExitValue / totalQuantity;
    }

    // CRITICAL FIX #2: Use actual Binance execution prices instead of order prices for P&L
    // Add null coalescing to prevent division by zero
    const buyCost = trade.buyOrder.cummulativeQuoteQty || 0;
    const sellRevenue = trade.sellOrders
      .filter((order: IOrder) => {
        const ocoStatus = order.orderListId ? ocoStatuses.get(order.orderListId) : null;
        const realOrderStatus = ocoStatus?.orderReports?.find(
          (report: BinanceOCOOrderReport) => report.orderId === order.orderId
        );
        const displayStatus = realOrderStatus?.status || order.status;
        return displayStatus === "FILLED";
      })
      .reduce((sum: number, order: IOrder) => sum + (order.cummulativeQuoteQty || 0), 0);

    // CRITICAL FIX #2: Calculate P&L percentage with validation to prevent division by zero
    let pnl = 0;
    if (buyCost > 0 && sellRevenue >= 0) {
      pnl = ((sellRevenue - buyCost) / buyCost) * 100;
    } else if (buyCost === 0) {
      console.warn("[getTradeCloseDetails] Buy cost is 0, cannot calculate P&L");
      pnl = 0;
    }

    if (stopLossTriggered) {
      return {
        closeType: "stop_loss",
        targetNumbers: [],
        exitPrice: averageExitPrice,
        pnlPercentage: pnl,
      };
    } else if (filledTargetsSet.size > 0) {
      // FIX BUG 1: Convert Set to sorted array (unique, ascending order)
      const filledTargets = Array.from(filledTargetsSet).sort((a, b) => a - b);
      return {
        closeType: "take_profit",
        targetNumbers: filledTargets,
        exitPrice: averageExitPrice,
        pnlPercentage: pnl,
      };
    }

    return { closeType: null, targetNumbers: [], exitPrice: null, pnlPercentage: null };
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

  const handleRetry = () => {
    // Navigate to execution page with the signal ID
    router.push(`/trades/execute?signalId=${signal._id}`);
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
                {/* Network badge */}
                {priceNetwork && (
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      priceNetwork === "testnet"
                        ? "bg-orange-100 border-orange-300 text-orange-700"
                        : "bg-green-100 border-green-300 text-green-700"
                    }`}
                  >
                    {priceNetwork.toUpperCase()}
                  </Badge>
                )}
              </div>
              {priceError ? (
                <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <p className="text-sm text-red-600 flex-1">{priceError}</p>
                  {/* Fix #6: Add manual retry button for price errors */}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setPriceError(null);
                      // Trigger immediate fetch by updating a dependency
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
                  <p className="text-2xl font-bold text-blue-600">
                    ${formatPrice(livePrice)}
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
                  {/* Warning if network mismatch */}
                  {trade && priceNetwork && trade.testnet !== (priceNetwork === "testnet") && (
                    <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                      <AlertTriangle className="h-3 w-3 inline mr-1" />
                      Price shown is from {priceNetwork}, but trade was executed on {trade.testnet ? "testnet" : "mainnet"}
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
                <>
                  {isStopLossHit() ? (
                    <Badge variant="destructive" className="text-xs bg-red-100 text-red-800 border-red-300">
                      <AlertTriangle className="h-3 w-3 mr-1 inline" />
                      SL Hit
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        getFilledTargets().size > 0
                          ? 'bg-green-100 text-green-800 border-green-300'
                          : 'bg-gray-100 text-gray-600 border-gray-300'
                      }`}
                    >
                      {getFilledTargets().size > 0 && <CheckCircle2 className="h-3 w-3 mr-1 inline" />}
                      {getFilledTargets().size}/{signal.targets.length} Hit
                    </Badge>
                  )}
                </>
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
                    {/* Trade Result Summary - Show for completed trades */}
                    {signal.status === "completed" && (() => {
                      const closeDetails = getTradeCloseDetails();
                      if (closeDetails.closeType) {
                        const isProfit = closeDetails.pnlPercentage && closeDetails.pnlPercentage > 0;
                        return (
                          <div className={`p-4 rounded-lg border-2 ${
                            closeDetails.closeType === "stop_loss"
                              ? "bg-red-50 border-red-300"
                              : "bg-green-50 border-green-300"
                          }`}>
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                {closeDetails.closeType === "stop_loss" ? (
                                  <AlertTriangle className="h-5 w-5 text-red-600" />
                                ) : (
                                  <TrendingUp className="h-5 w-5 text-green-600" />
                                )}
                                <span className={`font-bold text-sm ${
                                  closeDetails.closeType === "stop_loss"
                                    ? "text-red-800"
                                    : "text-green-800"
                                }`}>
                                  TRADE CLOSED
                                </span>
                              </div>
                              <Badge
                                variant="outline"
                                className={`font-bold ${
                                  isProfit
                                    ? "bg-green-100 text-green-800 border-green-400"
                                    : "bg-red-100 text-red-800 border-red-400"
                                }`}
                              >
                                {isProfit ? "+" : ""}{closeDetails.pnlPercentage?.toFixed(2)}% P&L
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div>
                                <span className="text-gray-600 font-medium">Close Reason:</span>
                                <div className={`mt-1 font-bold ${
                                  closeDetails.closeType === "stop_loss"
                                    ? "text-red-700"
                                    : "text-green-700"
                                }`}>
                                  {closeDetails.closeType === "stop_loss"
                                    ? "Stop Loss Triggered"
                                    : closeDetails.targetNumbers.length === 1
                                    ? `Target ${closeDetails.targetNumbers[0]} Hit`
                                    : `Targets ${closeDetails.targetNumbers.join(", ")} Hit`}
                                </div>
                              </div>
                              <div>
                                <span className="text-gray-600 font-medium">Exit Price:</span>
                                <div className="mt-1 font-bold text-gray-900">
                                  ${closeDetails.exitPrice?.toFixed(6)}
                                </div>
                              </div>
                              <div>
                                <span className="text-gray-600 font-medium">Entry Price:</span>
                                <div className="mt-1 font-medium text-gray-700">
                                  ${trade.buyOrder.price?.toFixed(6)}
                                </div>
                              </div>
                              <div>
                                <span className="text-gray-600 font-medium">Invested Amount:</span>
                                <div className="mt-1 font-medium text-gray-700">
                                  ${trade.investedAmount.toFixed(2)} USDT
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}

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
                    {signal.status === "failed" && signal.executionError ? (
                      <ErrorDetailCard
                        error={signal.executionError}
                        errorCode={signal.executionErrorCode}
                        timestamp={signal.executionErrorTimestamp}
                        failureReason={signal.failureReason}
                        onRetry={handleRetry}
                      />
                    ) : signal.status === "failed" ? (
                      <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                        <div className="flex items-center gap-2 text-sm text-red-800 font-semibold">
                          <AlertTriangle className="h-4 w-4" />
                          <span>Trade Execution Failed</span>
                        </div>
                        <p className="text-xs text-red-700 mt-2">
                          No detailed error information available. This may be an old failed signal from before error tracking was implemented.
                        </p>
                      </div>
                    ) : trade?.sellOrders && trade.sellOrders.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-semibold text-gray-700">
                            OCO SELL ORDERS (Take Profit & Stop Loss)
                          </div>
                          {fetchingOcoStatus && (
                            <RefreshCw className="h-3 w-3 animate-spin text-blue-500" />
                          )}
                        </div>
                        {(() => {
                          // Group orders by OCO pairs (orderListId)
                          const ocoGroups = new Map<number, IOrder[]>();
                          trade.sellOrders.forEach((order: IOrder) => {
                            if (order.orderListId) {
                              const existing = ocoGroups.get(order.orderListId) || [];
                              existing.push(order);
                              ocoGroups.set(order.orderListId, existing);
                            }
                          });

                          // Process each OCO pair
                          let tpIndex = 1;
                          return Array.from(ocoGroups.values()).map((orders) => {
                            // Identify Take Profit and Stop Loss from the pair
                            const takeProfit = orders.find(o => o.type === 'LIMIT_MAKER');
                            const stopLoss = orders.find(o => o.type === 'STOP_LOSS_LIMIT');

                            if (!takeProfit || !stopLoss) {
                              // Fallback: Display orders individually if pairing failed
                              return orders.map((order: IOrder) => {
                                const ocoStatus = order.orderListId ? ocoStatuses.get(order.orderListId) : null;
                                const realOrderStatus = ocoStatus?.orderReports?.find(
                                  (report: BinanceOCOOrderReport) => report.orderId === order.orderId
                                );
                                const displayStatus = realOrderStatus?.status || order.status;

                                return (
                                  <div key={order.orderId} className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs font-semibold text-gray-700">
                                        Order #{order.orderId}
                                      </span>
                                      <Badge variant="outline">{displayStatus}</Badge>
                                    </div>
                                  </div>
                                );
                              });
                            }

                            // Get real statuses from Binance
                            const ocoStatus = takeProfit.orderListId ? ocoStatuses.get(takeProfit.orderListId) : null;
                            const realTpOrderStatus = ocoStatus?.orderReports?.find(
                              (report: BinanceOCOOrderReport) => report.orderId === takeProfit.orderId
                            );
                            const realSlOrderStatus = ocoStatus?.orderReports?.find(
                              (report: BinanceOCOOrderReport) => report.orderId === stopLoss.orderId
                            );

                            // Use real status from Binance, fallback to database status
                            const tpStatus = realTpOrderStatus?.status || takeProfit.status;
                            const slStatus = realSlOrderStatus?.status || stopLoss.status;
                            const tpExecutedQty = realTpOrderStatus?.executedQty
                              ? parseFloat(realTpOrderStatus.executedQty)
                              : takeProfit.executedQty;
                            const slExecutedQty = realSlOrderStatus?.executedQty
                              ? parseFloat(realSlOrderStatus.executedQty)
                              : stopLoss.executedQty;
                            const tpFilledValue = realTpOrderStatus?.cummulativeQuoteQty
                              ? parseFloat(realTpOrderStatus.cummulativeQuoteQty)
                              : (takeProfit.cummulativeQuoteQty || 0); // ✅ Null coalescing to prevent NaN
                            const slFilledValue = realSlOrderStatus?.cummulativeQuoteQty
                              ? parseFloat(realSlOrderStatus.cummulativeQuoteQty)
                              : (stopLoss.cummulativeQuoteQty || 0); // ✅ Null coalescing to prevent NaN

                            // Determine what happened in this OCO pair
                            const tpTriggered = tpStatus === 'FILLED';
                            const slTriggered = slStatus === 'FILLED';
                            // const bothActive = tpStatus === 'NEW' && slStatus === 'NEW';

                            const currentTpIndex = tpIndex++;

                            return (
                              <div key={takeProfit.orderListId} className="bg-gray-50 p-4 rounded-lg border-2 border-gray-300 space-y-3">
                                {/* Take Profit Section */}
                                <div className={`p-3 rounded-lg border-2 ${
                                  tpTriggered
                                    ? 'bg-green-50 border-green-300'
                                    : tpStatus === 'CANCELED'
                                    ? 'bg-gray-100 border-gray-300'
                                    : 'bg-blue-50 border-blue-200'
                                }`}>
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-bold text-gray-800">
                                        Take Profit #{currentTpIndex}
                                      </span>
                                      {tpTriggered && (
                                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {trade.testnet && (
                                        <Badge variant="outline" className="text-xs bg-orange-100 border-orange-300">
                                          TESTNET
                                        </Badge>
                                      )}
                                      <Badge
                                        className={
                                          tpTriggered ? "bg-green-500 text-white" :
                                          tpStatus === "CANCELED" ? "bg-gray-400 text-white" :
                                          tpStatus === "PARTIALLY_FILLED" ? "bg-blue-500 text-white" :
                                          "bg-yellow-500 text-white"
                                        }
                                      >
                                        {tpStatus}
                                      </Badge>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                      <span className="text-gray-600">Target Price:</span>
                                      <span className="ml-2 font-medium text-green-700">
                                        ${formatPrice(takeProfit.price || 0)}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-gray-600">Quantity:</span>
                                      <span className="ml-2">{takeProfit.quantity.toFixed(6)}</span>
                                    </div>
                                    {tpExecutedQty > 0 && (
                                      <>
                                        <div>
                                          <span className="text-gray-600">Executed:</span>
                                          <span className="ml-2 font-semibold text-green-600">
                                            {tpExecutedQty.toFixed(6)}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-gray-600">Filled Value:</span>
                                          <span className="ml-2 font-medium">${tpFilledValue.toFixed(2)}</span>
                                        </div>
                                      </>
                                    )}
                                    <div className="col-span-2">
                                      <span className="text-gray-600">Order ID:</span>
                                      <span className="ml-2 font-mono text-xs">{takeProfit.orderId}</span>
                                    </div>
                                  </div>
                                  {tpTriggered && slStatus === 'CANCELED' && (
                                    <div className="mt-2 pt-2 border-t border-green-200">
                                      <span className="text-xs text-green-700 font-medium">
                                        ✓ Take profit executed successfully
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* Stop Loss Section */}
                                <div className={`p-3 rounded-lg border-2 ${
                                  slTriggered
                                    ? 'bg-red-50 border-red-300'
                                    : slStatus === 'CANCELED'
                                    ? 'bg-gray-100 border-gray-300'
                                    : 'bg-orange-50 border-orange-200'
                                }`}>
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-bold text-gray-800">
                                        Stop Loss for TP #{currentTpIndex}
                                      </span>
                                      {slTriggered && (
                                        <AlertTriangle className="h-4 w-4 text-red-600" />
                                      )}
                                    </div>
                                    <Badge
                                      className={
                                        slTriggered ? "bg-red-500 text-white" :
                                        slStatus === "CANCELED" ? "bg-gray-400 text-white" :
                                        slStatus === "PARTIALLY_FILLED" ? "bg-blue-500 text-white" :
                                        "bg-yellow-500 text-white"
                                      }
                                    >
                                      {slStatus}
                                    </Badge>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                      <span className="text-gray-600">Stop Price:</span>
                                      <span className="ml-2 font-medium text-red-700">
                                        ${formatPrice(stopLoss.stopPrice || 0)}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-gray-600">Quantity:</span>
                                      <span className="ml-2">{stopLoss.quantity.toFixed(6)}</span>
                                    </div>
                                    {slExecutedQty > 0 && (
                                      <>
                                        <div>
                                          <span className="text-gray-600">Executed:</span>
                                          <span className="ml-2 font-semibold text-red-600">
                                            {slExecutedQty.toFixed(6)}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-gray-600">Filled Value:</span>
                                          <span className="ml-2 font-medium">${slFilledValue.toFixed(2)}</span>
                                        </div>
                                      </>
                                    )}
                                    <div className="col-span-2">
                                      <span className="text-gray-600">Order ID:</span>
                                      <span className="ml-2 font-mono text-xs">{stopLoss.orderId}</span>
                                    </div>
                                  </div>
                                  {slTriggered && tpStatus === 'CANCELED' && (
                                    <div className="mt-2 pt-2 border-t border-red-200">
                                      <span className="text-xs text-red-700 font-medium">
                                        ⚠ Stop loss triggered - Take profit auto-cancelled
                                      </span>
                                    </div>
                                  )}
                                  {slStatus === 'CANCELED' && tpTriggered && (
                                    <div className="mt-2 pt-2 border-t border-gray-300">
                                      <span className="text-xs text-gray-600">
                                        Auto-cancelled when take profit filled
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* Live Status Indicator - Only show when using Binance API data */}
                                {ocoStatus && (
                                  <div className="flex items-center justify-center gap-2 pt-2 border-t border-gray-300">
                                    <span className="text-xs text-green-600 font-medium" title="Status verified from Binance API">
                                      ✓ Live data from Binance
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          });
                        })()}
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
                        {(() => {
                          // Calculate P&L from orders as fallback/verification
                          const calculatedPnL = calculatePnLFromOrders(trade);

                          // Use calculated P&L if available and database P&L is missing or looks incorrect
                          // The old bug stored P&L as -100 or -investedAmount
                          const shouldUseCalculated = calculatedPnL && (
                            trade.realizedPnL === undefined ||
                            trade.realizedPnL === null ||
                            trade.realizedPnL === -100 ||
                            trade.realizedPnL === -trade.investedAmount
                          );

                          const displayPnL = shouldUseCalculated
                            ? calculatedPnL.pnl
                            : trade.realizedPnL;
                          const displayPercentage = shouldUseCalculated
                            ? calculatedPnL.percentage
                            : ((trade.realizedPnL || 0) / trade.investedAmount) * 100;

                          // Only display if we have a valid P&L value
                          if (displayPnL === undefined || displayPnL === null) {
                            return null;
                          }

                          return (
                            <div>
                              <span className="text-gray-600">Realized P&L:</span>
                              <span className={`ml-2 font-bold ${displayPnL >= 0 ? "text-green-600" : "text-red-600"}`}>
                                ${displayPnL.toFixed(2)} ({displayPercentage.toFixed(2)}%)
                              </span>
                              {shouldUseCalculated && (
                                <span className="ml-1 text-xs text-gray-500" title="Calculated from actual order values">
                                  *
                                </span>
                              )}
                            </div>
                          );
                        })()}
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

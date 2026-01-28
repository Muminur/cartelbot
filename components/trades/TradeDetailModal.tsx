"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
import { Loader2, ExternalLink, TrendingUp, TrendingDown, RefreshCw, Radio, CheckCircle2, AlertTriangle } from "lucide-react";
import { formatCurrency, formatNumber, formatSymbol, formatDate, formatPrice } from "@/lib/utils/format";
import { ITrade, IOrder } from "@/types";
import { useRouter } from "next/navigation";
import { ClosePositionDialog } from "./ClosePositionDialog";

interface TradeDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tradeId: string;
  onTradeUpdated?: () => void;
}

// Constants for refresh intervals
const ORDER_STATUS_REFRESH_INTERVAL_MS = 10000; // 10 seconds

export function TradeDetailModal({
  open,
  onOpenChange,
  tradeId,
  onTradeUpdated,
}: TradeDetailModalProps) {
  const router = useRouter();
  const [trade, setTrade] = useState<ITrade | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchingOrderStatus, setFetchingOrderStatus] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [fetchingPrice, setFetchingPrice] = useState(false);

  // Refs to hold trade data for stable callbacks
  const tradeRef = useRef<ITrade | null>(null);

  // Keep tradeRef in sync with trade state
  useEffect(() => {
    tradeRef.current = trade;
  }, [trade]);

  useEffect(() => {
    if (open && tradeId) {
      fetchTradeDetails();
    }
  }, [open, tradeId]);

  const fetchTradeDetails = async () => {
    setLoading(true);
    try {
      const { safeJsonParse } = await import('@/lib/utils/api');
      const response = await fetch(`/api/trades/${tradeId}`);
      const data = await safeJsonParse<{ success: boolean; data?: any; error?: any }>(response, `Trade Details ${tradeId}`);

      if (data.success && data.data) {
        setTrade(data.data);
        // Fetch current price when trade is loaded
        if (data.data.symbol) {
          fetchCurrentPrice(data.data.symbol);
        }
      }
    } catch (error) {
      console.error("Error fetching trade details:", error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch current market price from Binance
  const fetchCurrentPrice = useCallback(async (symbol: string) => {
    setFetchingPrice(true);
    try {
      const { safeJsonParse } = await import('@/lib/utils/api');
      const response = await fetch(`/api/binance/ticker?symbol=${symbol}`);
      const data = await safeJsonParse<{ success: boolean; data?: any }>(response, `Trade Ticker ${symbol}`);

      if (data.success && data.data?.lastPrice) {
        setCurrentPrice(parseFloat(data.data.lastPrice));
      }
    } catch (error) {
      console.error("Error fetching current price:", error);
    } finally {
      setFetchingPrice(false);
    }
  }, []);

  // Fetch real-time order statuses from Binance API (NOT database)
  const fetchOrderStatuses = useCallback(async () => {
    const currentTrade = tradeRef.current;
    if (!currentTrade || !currentTrade.sellOrders || currentTrade.sellOrders.length === 0) return;

    // Only fetch if we have order IDs
    const ordersToCheck = currentTrade.sellOrders
      .filter((order: IOrder) => order.orderListId !== undefined)
      .map((order: IOrder) => ({
        symbol: currentTrade.symbol,
        orderId: order.orderId,
        orderListId: order.orderListId!,
      }));

    if (ordersToCheck.length === 0) return;

    setFetchingOrderStatus(true);

    try {
      const { safeJsonParse } = await import('@/lib/utils/api');
      const orderStatusResponse = await fetch("/api/trades/orders/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders: ordersToCheck }),
      });

      const orderStatusData = await safeJsonParse<{ success: boolean; data?: any }>(orderStatusResponse, 'Trade Order Status');

      if (orderStatusData.success && orderStatusData.data?.orders) {
        // Update trade.sellOrders with real-time statuses from Binance
        const updatedSellOrders = currentTrade.sellOrders.map((order: IOrder) => {
          const liveStatus = orderStatusData.data.orders.find(
            (o: any) => o.orderId === order.orderId
          );

          if (liveStatus && liveStatus.status !== "NOT_FOUND" && liveStatus.status !== "ERROR") {
            return {
              ...order,
              status: liveStatus.status, // Update with real FILLED/CANCELED status from Binance
              executedQty: parseFloat(liveStatus.executedQty || "0"),
              cummulativeQuoteQty: parseFloat(liveStatus.cummulativeQuoteQty || "0"),
            };
          }

          return order;
        });

        // Update trade state with live order statuses
        setTrade((prevTrade) => {
          if (!prevTrade) return prevTrade;
          return {
            ...prevTrade,
            sellOrders: updatedSellOrders,
          } as ITrade;
        });

        // Update last sync time
        setLastSyncTime(new Date());
      }
    } catch (error) {
      console.error("Error fetching order statuses:", error);
    } finally {
      setFetchingOrderStatus(false);
    }
  }, []); // No dependencies - uses tradeRef

  // Fetch order statuses when trade is loaded
  useEffect(() => {
    if (trade && open) {
      fetchOrderStatuses();
    }
  }, [trade?._id, open, fetchOrderStatuses]);

  // Auto-refresh order statuses every 10 seconds for open trades
  useEffect(() => {
    if (!trade || !open) return;
    if (trade.status !== "open" && trade.status !== "partial") return;

    const intervalId = setInterval(() => {
      fetchOrderStatuses();
    }, ORDER_STATUS_REFRESH_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [trade?.status, open, fetchOrderStatuses]);

  const handleViewSignal = () => {
    if (trade?.signalId) {
      // Extract ID whether signalId is a string or a populated object
      // Populated: {_id: "abc123", symbol: "BTC", ...} → "abc123"
      // String: "abc123" → "abc123"
      const signalIdString = typeof trade.signalId === "string"
        ? trade.signalId
        : (trade.signalId as { _id?: string })._id || String(trade.signalId);

      if (!signalIdString || signalIdString === "[object Object]") {
        console.error("[TradeDetailModal] Invalid signal ID:", trade.signalId);
        return;
      }

      router.push(`/signals/history?signalId=${signalIdString}&openModal=true`);
      onOpenChange(false);
    }
  };

  const handleClosePosition = () => {
    setCloseDialogOpen(true);
  };

  const handlePositionClosed = () => {
    fetchTradeDetails();
    if (onTradeUpdated) {
      onTradeUpdated();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open":
        return "bg-blue-100 text-blue-800";
      case "partial":
        return "bg-yellow-100 text-yellow-800";
      case "closed":
        return "bg-green-100 text-green-800";
      case "cancelled":
        return "bg-muted text-muted-foreground";
      case "pending_approval":
        return "bg-purple-100 text-purple-800 dark:bg-purple-950/30 dark:text-purple-300";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getCloseReasonColor = (reason?: string) => {
    switch (reason) {
      case "target":
        return "bg-green-100 text-green-800";
      case "stop_loss":
        return "bg-red-100 text-red-800";
      case "manual":
        return "bg-blue-100 text-blue-800";
      case "cancelled":
        return "bg-muted text-muted-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getOrderStatusColor = (status: string) => {
    switch (status) {
      case "FILLED":
        return "bg-green-100 text-green-800";
      case "PARTIALLY_FILLED":
        return "bg-yellow-100 text-yellow-800";
      case "NEW":
        return "bg-blue-100 text-blue-800";
      case "CANCELED":
      case "CANCELLED":
        return "bg-muted text-muted-foreground";
      case "REJECTED":
        return "bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-300";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogTitle className="sr-only">Loading Trade Details</DialogTitle>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!trade) {
    return null;
  }

  // Calculate unrealized P&L for open/partial trades
  let unrealizedPnL = 0;
  let unrealizedPnLPercentage = 0;

  if ((trade.status === "open" || trade.status === "partial") && currentPrice && trade.buyOrder) {
    // Calculate remaining quantity (total bought - total sold)
    const totalBought = trade.buyOrder.executedQty || trade.quantity;
    const totalSold = trade.sellOrders?.reduce((sum, order) => {
      return sum + (order.executedQty || 0);
    }, 0) || 0;
    const remainingQty = totalBought - totalSold;

    // Calculate entry price from buy order
    const entryPrice = trade.entryPrice || (trade.buyOrder.price || 0);

    // Calculate unrealized P&L
    if (remainingQty > 0 && entryPrice > 0) {
      unrealizedPnL = (currentPrice - entryPrice) * remainingQty;

      // Calculate proportional cost for percentage
      const proportionalCost = trade.investedAmount * (remainingQty / totalBought);
      unrealizedPnLPercentage = proportionalCost > 0 ? (unrealizedPnL / proportionalCost) * 100 : 0;
    }
  }

  const pnl = trade.status === "closed" ? (trade.realizedPnL || 0) : unrealizedPnL;
  const pnlPercentage = trade.status === "closed"
    ? (trade.investedAmount > 0 ? ((trade.realizedPnL || 0) / trade.investedAmount) * 100 : 0)
    : unrealizedPnLPercentage;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-2xl">Trade Details</DialogTitle>
              <div className="flex gap-2">
                <Badge className={getStatusColor(trade.status)}>{trade.status}</Badge>
                {trade.closeReason && (
                  <Badge className={getCloseReasonColor(trade.closeReason)}>
                    {trade.closeReason}
                  </Badge>
                )}
              </div>
            </div>
            <DialogDescription className="flex items-center justify-between">
              <span>Trade ID: {String(trade._id)}</span>
              {lastSyncTime && (
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <Radio className="h-3 w-3 animate-pulse" />
                  Live data from Binance (synced {lastSyncTime.toLocaleTimeString()})
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Main Trade Information */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Symbol</p>
                <p className="text-xl font-bold">{formatSymbol(trade.symbol)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Status</p>
                <Badge className={getStatusColor(trade.status)}>{trade.status}</Badge>
              </div>
            </div>

            <Separator />

            {/* Entry Details */}
            <div>
              <h3 className="font-semibold mb-3 text-foreground">Entry Details</h3>
              <div className="grid grid-cols-2 gap-4 bg-muted/50 p-4 rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Entry Price</p>
                  <p className="font-medium">{formatCurrency(trade.entryPrice)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Quantity</p>
                  <p className="font-medium">{formatNumber(trade.quantity, 8)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Amount Invested</p>
                  <p className="font-medium">{formatCurrency(trade.investedAmount)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Entry Time</p>
                  <p className="font-medium text-sm">{formatDate(trade.createdAt)}</p>
                </div>
              </div>
            </div>

            {/* Exit Details (if closed) */}
            {trade.status === "closed" && trade.exitPrice && (
              <div>
                <h3 className="font-semibold mb-3 text-foreground">Exit Details</h3>
                <div className="grid grid-cols-2 gap-4 bg-muted/50 p-4 rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground">Exit Price</p>
                    <p className="font-medium">{formatCurrency(trade.exitPrice)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Received</p>
                    <p className="font-medium">
                      {formatCurrency(trade.exitPrice * trade.quantity)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Close Reason</p>
                    <Badge className={getCloseReasonColor(trade.closeReason)}>
                      {trade.closeReason || "N/A"}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Close Time</p>
                    <p className="font-medium text-sm">{formatDate(trade.updatedAt)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* P&L Breakdown */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-foreground">P&L Breakdown</h3>
                {(trade.status === "open" || trade.status === "partial") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => trade.symbol && fetchCurrentPrice(trade.symbol)}
                    disabled={fetchingPrice}
                    className="h-8"
                  >
                    {fetchingPrice ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Refresh Price
                      </>
                    )}
                  </Button>
                )}
              </div>
              <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                {(trade.status === "open" || trade.status === "partial") && currentPrice && (
                  <div className="flex items-center justify-between pb-3 border-b border-border">
                    <span className="text-sm text-muted-foreground">Current Market Price</span>
                    <div className="text-right">
                      <div className="font-medium">{formatCurrency(currentPrice)}</div>
                      <div className="text-xs text-muted-foreground">Live from Binance</div>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {trade.status === "closed" ? "Realized P&L" : "Unrealized P&L"}
                  </span>
                  <div className="text-right">
                    <div className={`font-bold text-lg ${pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {pnl >= 0 ? <TrendingUp className="inline h-5 w-5 mr-1" /> : <TrendingDown className="inline h-5 w-5 mr-1" />}
                      {formatCurrency(pnl)}
                    </div>
                    <div className={`text-sm ${pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                      ({pnlPercentage >= 0 ? "+" : ""}{pnlPercentage.toFixed(2)}%)
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Buy Order */}
            <div>
              <h3 className="font-semibold mb-3 text-foreground">Buy Order</h3>
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Order ID</span>
                  <span className="font-mono text-sm">{trade.buyOrder.orderId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Price</span>
                  <span className="font-medium">{formatCurrency(trade.buyOrder.price || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Quantity</span>
                  <span className="font-medium">{formatNumber(trade.buyOrder.quantity, 8)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge className={getOrderStatusColor(trade.buyOrder.status)}>
                    {trade.buyOrder.status}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Time</span>
                  <span className="text-sm">{formatDate(trade.buyOrder.timestamp)}</span>
                </div>
              </div>
            </div>

            {/* OCO Sell Orders */}
            {trade.sellOrders && trade.sellOrders.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">OCO Sell Orders ({trade.sellOrders.length})</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchOrderStatuses}
                    disabled={fetchingOrderStatus}
                    className="h-8"
                  >
                    {fetchingOrderStatus ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Refresh Status
                      </>
                    )}
                  </Button>
                </div>
                <div className="space-y-4">
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
                        return orders.map((order: IOrder) => (
                          <div key={order.orderId} className="bg-muted/50 p-4 rounded-lg border border-border">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-semibold text-foreground">
                                Order #{order.orderId}
                              </span>
                              <Badge className={getOrderStatusColor(order.status)}>
                                {order.status}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <span className="text-muted-foreground">Price:</span>
                                <span className="ml-2">${formatPrice(order.price || 0, 6)}</span>
                              </div>
                              {order.stopPrice && (
                                <div>
                                  <span className="text-muted-foreground">Stop:</span>
                                  <span className="ml-2">${formatPrice(order.stopPrice, 6)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ));
                      }

                      // Get order statuses
                      const tpStatus = takeProfit.status;
                      const slStatus = stopLoss.status;
                      const tpExecutedQty = takeProfit.executedQty || 0;
                      const slExecutedQty = stopLoss.executedQty || 0;
                      const tpFilledValue = takeProfit.cummulativeQuoteQty || 0;
                      const slFilledValue = stopLoss.cummulativeQuoteQty || 0;

                      // Determine what happened in this OCO pair
                      const tpTriggered = tpStatus === 'FILLED';
                      const slTriggered = slStatus === 'FILLED';

                      const currentTpIndex = tpIndex++;

                      return (
                        <div key={takeProfit.orderListId} className="bg-muted/50 p-4 rounded-lg border-2 border-border space-y-3">
                          {/* OCO Pair Header */}
                          <div className="text-xs font-semibold text-muted-foreground/80 mb-2">
                            OCO Pair #{currentTpIndex} (Order List ID: {takeProfit.orderListId})
                          </div>

                          {/* Take Profit Section */}
                          <div className={`p-3 rounded-lg border-2 ${
                            tpTriggered
                              ? 'bg-green-50 border-green-300 dark:bg-green-950/20 dark:border-green-800'
                              : tpStatus === 'CANCELED' || tpStatus === 'CANCELLED'
                              ? 'bg-muted/70 border-border'
                              : 'bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800'
                          }`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-foreground">
                                  Take Profit #{currentTpIndex}
                                </span>
                                {tpTriggered && (
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                )}
                              </div>
                              <Badge
                                className={
                                  tpTriggered ? "bg-green-500 text-white dark:bg-green-600" :
                                  tpStatus === "CANCELED" || tpStatus === "CANCELLED" ? "bg-muted-foreground/60 text-white" :
                                  tpStatus === "PARTIALLY_FILLED" ? "bg-blue-500 text-white dark:bg-blue-600" :
                                  "bg-yellow-500 text-white dark:bg-yellow-600"
                                }
                              >
                                {tpStatus}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-muted-foreground">Target Price:</span>
                                <span className="ml-2 font-medium text-green-700">
                                  ${formatPrice(takeProfit.price || 0, 6)}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Quantity:</span>
                                <span className="ml-2">{formatNumber(takeProfit.quantity, 6)}</span>
                              </div>
                              {tpExecutedQty > 0 && (
                                <>
                                  <div>
                                    <span className="text-muted-foreground">Executed:</span>
                                    <span className="ml-2 font-semibold text-green-600">
                                      {formatNumber(tpExecutedQty, 6)}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Filled Value:</span>
                                    <span className="ml-2 font-medium">${tpFilledValue.toFixed(2)}</span>
                                  </div>
                                </>
                              )}
                              <div className="col-span-2">
                                <span className="text-muted-foreground">Order ID:</span>
                                <span className="ml-2 font-mono text-xs">{takeProfit.orderId}</span>
                              </div>
                            </div>
                            {tpTriggered && (slStatus === 'CANCELED' || slStatus === 'CANCELLED') && (
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
                              ? 'bg-red-50 border-red-300 dark:bg-red-950/20 dark:border-red-800'
                              : slStatus === 'CANCELED' || slStatus === 'CANCELLED'
                              ? 'bg-muted/70 border-border'
                              : 'bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-800'
                          }`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-foreground">
                                  Stop Loss for TP #{currentTpIndex}
                                </span>
                                {slTriggered && (
                                  <AlertTriangle className="h-4 w-4 text-red-600" />
                                )}
                              </div>
                              <Badge
                                className={
                                  slTriggered ? "bg-red-500 text-white dark:bg-red-600" :
                                  slStatus === "CANCELED" || slStatus === "CANCELLED" ? "bg-muted-foreground/60 text-white" :
                                  slStatus === "PARTIALLY_FILLED" ? "bg-blue-500 text-white dark:bg-blue-600" :
                                  "bg-yellow-500 text-white dark:bg-yellow-600"
                                }
                              >
                                {slStatus}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-muted-foreground">Stop Price:</span>
                                <span className="ml-2 font-medium text-red-700">
                                  ${formatPrice(stopLoss.stopPrice || 0, 6)}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Quantity:</span>
                                <span className="ml-2">{formatNumber(stopLoss.quantity, 6)}</span>
                              </div>
                              {slExecutedQty > 0 && (
                                <>
                                  <div>
                                    <span className="text-muted-foreground">Executed:</span>
                                    <span className="ml-2 font-semibold text-red-600">
                                      {formatNumber(slExecutedQty, 6)}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Filled Value:</span>
                                    <span className="ml-2 font-medium">${slFilledValue.toFixed(2)}</span>
                                  </div>
                                </>
                              )}
                              <div className="col-span-2">
                                <span className="text-muted-foreground">Order ID:</span>
                                <span className="ml-2 font-mono text-xs">{stopLoss.orderId}</span>
                              </div>
                            </div>
                            {slTriggered && (tpStatus === 'CANCELED' || tpStatus === 'CANCELLED') && (
                              <div className="mt-2 pt-2 border-t border-red-200">
                                <span className="text-xs text-red-700 font-medium">
                                  ⚠ Stop loss triggered - position closed at loss
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {/* Signal Information */}
            {trade.signalId && (
              <div>
                <h3 className="font-semibold mb-3 text-foreground">Signal Information</h3>
                <div className="bg-muted/50 p-4 rounded-lg">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-muted-foreground block mb-1">Signal ID</span>
                      <code className="text-xs text-foreground/80 break-all block">
                        {typeof trade.signalId === "string"
                          ? trade.signalId
                          : (trade.signalId as { _id?: string })._id || "N/A"}
                      </code>
                    </div>
                    <Button
                      variant="link"
                      size="sm"
                      onClick={handleViewSignal}
                      className="h-auto p-0 flex-shrink-0"
                    >
                      View Signal
                      <ExternalLink className="ml-1 h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            {(trade.status === "open" || trade.status === "partial") && (
              <div className="pt-4">
                <Button
                  variant="destructive"
                  onClick={handleClosePosition}
                  className="w-full"
                >
                  Close Position Manually
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Close Position Dialog */}
      {trade && (
        <ClosePositionDialog
          open={closeDialogOpen}
          onOpenChange={setCloseDialogOpen}
          trade={{
            _id: String(trade._id),
            symbol: trade.symbol,
            quantity: trade.quantity,
            entryPrice: trade.entryPrice,
            investedAmount: trade.investedAmount,
          }}
          onClose={handlePositionClosed}
        />
      )}
    </>
  );
}

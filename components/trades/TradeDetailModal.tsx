"use client";

import { useEffect, useState, useCallback } from "react";
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
import { Loader2, ExternalLink, TrendingUp, TrendingDown, RefreshCw, Radio } from "lucide-react";
import { formatCurrency, formatNumber, formatSymbol, formatDate } from "@/lib/utils/format";
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

  useEffect(() => {
    if (open && tradeId) {
      fetchTradeDetails();
    }
  }, [open, tradeId]);

  const fetchTradeDetails = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/trades/${tradeId}`);
      const data = await response.json();

      if (data.success && data.data) {
        setTrade(data.data);
      }
    } catch (error) {
      console.error("Error fetching trade details:", error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch real-time order statuses from Binance API (NOT database)
  const fetchOrderStatuses = useCallback(async () => {
    if (!trade || !trade.sellOrders || trade.sellOrders.length === 0) return;

    // Only fetch if we have order IDs
    const ordersToCheck = trade.sellOrders
      .filter((order: IOrder) => order.orderListId !== undefined)
      .map((order: IOrder) => ({
        symbol: trade.symbol,
        orderId: order.orderId,
        orderListId: order.orderListId!,
      }));

    if (ordersToCheck.length === 0) return;

    setFetchingOrderStatus(true);

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
  }, [trade]);

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
      router.push(`/signals?id=${trade.signalId}`);
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
        return "bg-gray-100 text-gray-800";
      case "pending_approval":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
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
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
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
        return "bg-gray-100 text-gray-800";
      case "REJECTED":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
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

  const pnl = trade.realizedPnL || trade.unrealizedPnL || 0;
  const pnlPercentage = trade.investedAmount > 0 ? (pnl / trade.investedAmount) * 100 : 0;

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
                <p className="text-sm text-gray-600 mb-1">Symbol</p>
                <p className="text-xl font-bold">{formatSymbol(trade.symbol)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Status</p>
                <Badge className={getStatusColor(trade.status)}>{trade.status}</Badge>
              </div>
            </div>

            <Separator />

            {/* Entry Details */}
            <div>
              <h3 className="font-semibold mb-3">Entry Details</h3>
              <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
                <div>
                  <p className="text-sm text-gray-600">Entry Price</p>
                  <p className="font-medium">{formatCurrency(trade.entryPrice)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Quantity</p>
                  <p className="font-medium">{formatNumber(trade.quantity, 8)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Amount Invested</p>
                  <p className="font-medium">{formatCurrency(trade.investedAmount)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Entry Time</p>
                  <p className="font-medium text-sm">{formatDate(trade.createdAt)}</p>
                </div>
              </div>
            </div>

            {/* Exit Details (if closed) */}
            {trade.status === "closed" && trade.exitPrice && (
              <div>
                <h3 className="font-semibold mb-3">Exit Details</h3>
                <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
                  <div>
                    <p className="text-sm text-gray-600">Exit Price</p>
                    <p className="font-medium">{formatCurrency(trade.exitPrice)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total Received</p>
                    <p className="font-medium">
                      {formatCurrency(trade.exitPrice * trade.quantity)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Close Reason</p>
                    <Badge className={getCloseReasonColor(trade.closeReason)}>
                      {trade.closeReason || "N/A"}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Close Time</p>
                    <p className="font-medium text-sm">{formatDate(trade.updatedAt)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* P&L Breakdown */}
            <div>
              <h3 className="font-semibold mb-3">P&L Breakdown</h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">
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
              <h3 className="font-semibold mb-3">Buy Order</h3>
              <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Order ID</span>
                  <span className="font-mono text-sm">{trade.buyOrder.orderId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Price</span>
                  <span className="font-medium">{formatCurrency(trade.buyOrder.price || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Quantity</span>
                  <span className="font-medium">{formatNumber(trade.buyOrder.quantity, 8)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Status</span>
                  <Badge className={getOrderStatusColor(trade.buyOrder.status)}>
                    {trade.buyOrder.status}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Time</span>
                  <span className="text-sm">{formatDate(trade.buyOrder.timestamp)}</span>
                </div>
              </div>
            </div>

            {/* Sell Orders */}
            {trade.sellOrders && trade.sellOrders.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Sell Orders ({trade.sellOrders.length})</h3>
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
                <div className="space-y-3">
                  {trade.sellOrders.map((order, index) => (
                    <div key={index} className="bg-gray-50 p-4 rounded-lg space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold">Order #{index + 1}</span>
                        <Badge className={getOrderStatusColor(order.status)}>
                          {order.status}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-gray-600">Order ID:</span>
                          <span className="font-mono ml-2">{order.orderId}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Price:</span>
                          <span className="ml-2">{formatCurrency(order.price || 0)}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Quantity:</span>
                          <span className="ml-2">{formatNumber(order.quantity, 8)}</span>
                        </div>
                        {order.stopPrice && (
                          <div>
                            <span className="text-gray-600">Stop:</span>
                            <span className="ml-2">{formatCurrency(order.stopPrice)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Signal Information */}
            {trade.signalId && (
              <div>
                <h3 className="font-semibold mb-3">Signal Information</h3>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Signal ID</span>
                    <Button
                      variant="link"
                      size="sm"
                      onClick={handleViewSignal}
                      className="h-auto p-0"
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

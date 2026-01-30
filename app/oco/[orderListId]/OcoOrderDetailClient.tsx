"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  RefreshCw,
  XCircle,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertCircle,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface OrderReport {
  orderId: number;
  orderListId: number;
  symbol: string;
  side: string;
  type: string;
  price: string;
  origQty: string;
  executedQty: string;
  status: string;
  stopPrice?: string;
}

interface OCOStatus {
  symbol: string;
  listStatusType: string;
  listOrderStatus: string;
  orderReports: OrderReport[];
}

interface SignalData {
  _id: string;
  symbol: string;
  entries: number[];
  targets: number[];
  stopLoss: number;
  status: string;
  rawSignal: string;
  currentMarketPrice?: number;
}

interface TradeData {
  _id: string;
  symbol: string;
  signalId: SignalData | null;
  entryPrice: number;
  testnet: boolean;
  sellOrders: Array<{
    orderListId?: number;
    type: string;
    price: number;
    stopPrice?: number;
    quantity: number;
    status: string;
  }>;
}

export default function OCODetailPage() {
  const router = useRouter();
  const params = useParams();
  const orderListId = params?.orderListId as string;

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [ocoStatus, setOcoStatus] = useState<OCOStatus | null>(null);
  const [tradeData, setTradeData] = useState<TradeData | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [canceling, setCanceling] = useState(false);
  const [apiKeysError, setApiKeysError] = useState<string | null>(null);

  // Use ref to prevent interval recreation
  const statusRef = useRef<OCOStatus | null>(null);

  // Update ref when status changes
  useEffect(() => {
    statusRef.current = ocoStatus;
  }, [ocoStatus]);

  // Fetch user session
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/session");
        if (!res.ok) {
          router.push("/login");
          return;
        }
        const data = await res.json();

        // Validate session response structure
        if (!data.success || !data.data?.user) {
          router.push("/login");
          return;
        }

        // FIX: Session API returns { success: true, data: { user: {...} } }
        const userData = data.data.user;
        setUser(userData);

        // Check if user has API keys configured
        if (!userData.hasApiKeys) {
          setApiKeysError("Binance API keys not configured. Live OCO status cannot be fetched without API keys.");
        }
      } catch (error) {
        console.error("Failed to fetch session:", error);
        router.push("/login");
      } finally {
        // Always stop loading, regardless of success or failure
        setLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  // Fetch trade data from database
  const fetchTradeData = async () => {
    if (!user || !orderListId) return null;

    try {
      const res = await fetch("/api/oco");
      const data = await res.json();

      if (data.success && data.data) {
        // Find the trade with this orderListId
        const ocoOrder = data.data.find(
          (order: any) => String(order.orderListId) === String(orderListId)
        );

        if (ocoOrder && ocoOrder.signalId) {
          // Return trade data with populated signal
          return {
            _id: ocoOrder.tradeId,
            symbol: ocoOrder.symbol,
            signalId: ocoOrder.signalId,
            entryPrice: 0, // Will be populated from buyOrder if needed
            testnet: ocoOrder.testnet || false,
            sellOrders: ocoOrder.orders || [],
          } as TradeData;
        }
      }
      return null;
    } catch (error) {
      console.error("Failed to fetch trade data:", error);
      return null;
    }
  };

  // Fetch live status (separate function for interval)
  const fetchLiveStatus = async () => {
    if (!user || !orderListId) return;

    try {
      const res = await fetch(`/api/trades/oco-status/${orderListId}`);
      const data = await res.json();

      if (data.success) {
        setOcoStatus(data.data);
        // Fetch current price
        await fetchCurrentPrice(data.data.symbol);
      }
    } catch (error) {
      console.error("Failed to fetch live status:", error);
    }
  };

  // Fetch order details (initial load)
  const fetchOrderDetails = async () => {
    if (!user || !orderListId) return;

    setLoading(true);
    try {
      // Fetch both OCO status from Binance and trade data from database
      const [ocoRes, tradeDataResult] = await Promise.all([
        fetch(`/api/trades/oco-status/${orderListId}`).catch(() => null),
        fetchTradeData(),
      ]);

      // Set trade data (always available from database)
      if (tradeDataResult) {
        setTradeData(tradeDataResult);
        // Fetch current price using symbol from trade data
        await fetchCurrentPrice(tradeDataResult.symbol);
      }

      // Set OCO status (may not be available if order not found on Binance)
      if (ocoRes) {
        const data = await ocoRes.json();
        if (data.success) {
          setOcoStatus(data.data);
          // Update price with OCO status symbol if available
          await fetchCurrentPrice(data.data.symbol);
        }
      }
    } catch (error) {
      console.error("Failed to fetch order details:", error);
      toast.error("Failed to fetch order details");
    } finally {
      setLoading(false);
    }
  };

  // Fetch current price
  const fetchCurrentPrice = async (symbol: string) => {
    try {
      const res = await fetch(`/api/binance/ticker?symbol=${symbol}`);
      const data = await res.json();

      if (data.success) {
        setCurrentPrice(parseFloat(data.data.price));
        setPriceChange(parseFloat(data.data.priceChangePercent));
      }
    } catch (error) {
      console.error("Failed to fetch current price:", error);
    }
  };

  useEffect(() => {
    if (!user || !orderListId) return;
    fetchOrderDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, orderListId]);

  // Auto-refresh every 10 seconds (create interval once)
  useEffect(() => {
    if (!statusRef.current) return;

    const interval = setInterval(() => {
      if (statusRef.current) {
        fetchLiveStatus();
      }
    }, 10000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - create interval once

  // Handle cancel OCO
  const handleCancel = async () => {
    if (!ocoStatus) return;

    if (!confirm("Are you sure you want to cancel this OCO order?")) return;

    setCanceling(true);
    try {
      // Find the trade associated with this OCO order
      const tradesRes = await fetch("/api/trades");
      const tradesData = await tradesRes.json();

      if (!tradesData.success) {
        throw new Error("Failed to fetch trades");
      }

      // Find trade with this orderListId
      const trade = tradesData.data.find((t: any) =>
        t.sellOrders?.some(
          (o: any) => o.orderListId === parseInt(orderListId)
        )
      );

      if (!trade) {
        throw new Error("Trade not found for this OCO order");
      }

      // Call the close trade endpoint which will cancel the OCO
      const res = await fetch(`/api/trades/close/${trade._id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await res.json();

      if (data.success) {
        toast.success("OCO order canceled successfully");
        // Refresh order details
        await fetchOrderDetails();
      } else {
        toast.error(data.error?.message || "Failed to cancel order");
      }
    } catch (error) {
      console.error("Failed to cancel order:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to cancel order"
      );
    } finally {
      setCanceling(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      NEW: "bg-blue-500 text-white",
      FILLED: "bg-green-500 text-white",
      CANCELED: "bg-gray-500 text-white",
      PARTIALLY_FILLED: "bg-yellow-500 text-white",
      ALL_DONE: "bg-green-500 text-white",
      EXECUTING: "bg-blue-500 text-white",
    };
    return (
      <Badge className={colors[status] || "bg-gray-500 text-white"}>
        {status}
      </Badge>
    );
  };

  if (loading) {
    return (
      <DashboardLayout userEmail={user?.email || ""}>
        <div className="flex items-center justify-center h-96">
          <RefreshCw className="h-8 w-8 animate-spin text-purple-600" />
        </div>
      </DashboardLayout>
    );
  }

  if (!ocoStatus && !tradeData) {
    return (
      <DashboardLayout userEmail={user?.email || ""}>
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            OCO order not found in Binance or database
          </p>
          <Button onClick={() => router.push("/oco")} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to OCO Orders
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  // If OCO not found on Binance but we have trade data, show signal details
  if (!ocoStatus && tradeData) {
    const signal = tradeData.signalId as SignalData | null;

    return (
      <DashboardLayout userEmail={user?.email || ""}>
        <div className="space-y-6">
          <div className="flex items-center gap-4 flex-wrap">
            <Button variant="outline" onClick={() => router.push("/oco")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <h1 className="text-3xl font-bold">OCO Order #{orderListId}</h1>
          </div>

          {/* Warning Card */}
          <Card className="border-yellow-500">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-600">
                <XCircle className="h-5 w-5" />
                OCO Order Not Found on Binance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                This OCO order could not be found on Binance{" "}
                <Badge
                  className={
                    tradeData.testnet
                      ? "bg-orange-500 text-white"
                      : "bg-green-500 text-white"
                  }
                >
                  {tradeData.testnet ? "TESTNET" : "MAINNET"}
                </Badge>
                . It may have been executed, canceled, expired, or archived (orders older than 90 days).
                {signal
                  ? " Below are the signal details associated with this order."
                  : " Signal information is not available for this order."}
              </p>
            </CardContent>
          </Card>

          {/* Signal Details Card */}
          {signal && (
            <Card>
              <CardHeader>
                <CardTitle>Signal Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-muted-foreground">Signal ID</p>
                    <p className="font-mono text-sm">{signal._id}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Symbol</p>
                    <p className="text-2xl font-bold">{signal.symbol}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <div className="mt-1">
                      {signal.status ? (
                        getStatusBadge(signal.status.toUpperCase())
                      ) : (
                        <Badge variant="outline">Unknown</Badge>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Current Price</p>
                    <div className="flex items-center gap-2">
                      <p className="text-2xl font-bold">
                        ${currentPrice.toFixed(6)}
                      </p>
                      <Badge
                        className={`${
                          priceChange >= 0
                            ? "bg-green-500 text-white"
                            : "bg-red-500 text-white"
                        } flex items-center gap-1`}
                      >
                        {priceChange >= 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {priceChange >= 0 ? "+" : ""}
                        {priceChange.toFixed(2)}%
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Entry Prices */}
                {signal.entries && signal.entries.length > 0 && (
                  <div className="mt-6">
                    <p className="text-sm text-muted-foreground mb-2">
                      Entry Prices
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {signal.entries.map((entry, idx) => (
                        <Badge key={idx} variant="outline" className="text-base">
                          ${entry.toFixed(6)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Target Prices */}
                {signal.targets && signal.targets.length > 0 && (
                  <div className="mt-6">
                    <p className="text-sm text-muted-foreground mb-2">
                      Target Prices
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {signal.targets.map((target, idx) => (
                        <Badge
                          key={idx}
                          className="bg-green-500 text-white text-base"
                        >
                          Target {idx + 1}: ${target.toFixed(6)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stop Loss */}
                {signal.stopLoss && (
                  <div className="mt-6">
                    <p className="text-sm text-muted-foreground mb-2">Stop Loss</p>
                    <Badge className="bg-red-500 text-white text-base">
                      ${signal.stopLoss.toFixed(6)}
                    </Badge>
                  </div>
                )}

                {/* Raw Signal */}
                {signal.rawSignal && (
                  <div className="mt-6">
                    <p className="text-sm text-muted-foreground mb-2">
                      Raw Signal Text
                    </p>
                    <div className="bg-muted p-4 rounded-md">
                      <pre className="text-sm whitespace-pre-wrap text-foreground">
                        {signal.rawSignal}
                      </pre>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Fallback message when signal is null */}
          {!signal && (
            <Card>
              <CardHeader>
                <CardTitle>Signal Details</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Signal information not available for this OCO order.
                </p>
              </CardContent>
            </Card>
          )}

          {/* OCO Orders from Database */}
          {tradeData.sellOrders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>OCO Orders (Database Records)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {tradeData.sellOrders.map((order, idx) => {
                    const isTakeProfit = order.type === "LIMIT_MAKER";
                    return (
                      <Card key={idx} className="border">
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base flex items-center gap-2">
                              {isTakeProfit ? (
                                <>
                                  <TrendingUp className="h-5 w-5 text-green-600" />
                                  Take Profit
                                </>
                              ) : (
                                <>
                                  <TrendingDown className="h-5 w-5 text-red-600" />
                                  Stop Loss
                                </>
                              )}
                            </CardTitle>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2 text-sm">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <p className="text-muted-foreground">Type</p>
                                <p className="font-mono">{order.type}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Status</p>
                                {getStatusBadge(order.status)}
                              </div>
                              <div>
                                <p className="text-muted-foreground">
                                  {isTakeProfit ? "Target Price" : "Stop Price"}
                                </p>
                                <p className="font-bold">
                                  ${(order.stopPrice || order.price).toFixed(6)}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Quantity</p>
                                <p className="font-bold">
                                  {order.quantity.toFixed(6)}
                                </p>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userEmail={user?.email || ""}>
      <div className="space-y-6">
        <div className="flex items-center gap-4 flex-wrap">
          <Button variant="outline" onClick={() => router.push("/oco")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold">OCO Order #{orderListId}</h1>
        </div>

        {/* API Keys Warning */}
        {apiKeysError && (
          <Alert variant="destructive" className="border-orange-500 bg-orange-50">
            <AlertCircle className="h-4 w-4 text-orange-600" />
            <AlertTitle className="text-orange-900">API Keys Required</AlertTitle>
            <AlertDescription className="text-orange-800">
              {apiKeysError}
              <Button
                variant="outline"
                size="sm"
                className="ml-4 border-orange-600 text-orange-600 hover:bg-orange-100"
                onClick={() => router.push("/settings")}
              >
                <Settings className="h-4 w-4 mr-2" />
                Go to Settings
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Overview Card */}
        {ocoStatus && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Order Overview</span>
                {tradeData && (
                  <Badge
                    className={
                      tradeData.testnet
                        ? "bg-orange-500 text-white"
                        : "bg-green-500 text-white"
                    }
                  >
                    {tradeData.testnet ? "TESTNET" : "MAINNET"}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-sm text-muted-foreground">Symbol</p>
                  <p className="text-2xl font-bold">{ocoStatus.symbol}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Current Price</p>
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-bold">
                      ${currentPrice.toFixed(6)}
                    </p>
                    <Badge
                      className={`${
                        priceChange >= 0
                          ? "bg-green-500 text-white"
                          : "bg-red-500 text-white"
                      } flex items-center gap-1`}
                    >
                      {priceChange >= 0 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {priceChange >= 0 ? "+" : ""}
                      {priceChange.toFixed(2)}%
                    </Badge>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <div className="mt-1">
                    {getStatusBadge(ocoStatus.listOrderStatus)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Individual Orders */}
        {ocoStatus && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {ocoStatus.orderReports?.map((report, index) => {
            const isTakeProfit = report.type === "LIMIT_MAKER";
            const price = parseFloat(report.price);
            const stopPrice = report.stopPrice
              ? parseFloat(report.stopPrice)
              : null;
            const quantity = parseFloat(report.origQty);
            const executedQty = parseFloat(report.executedQty);
            const isFilled = report.status === "FILLED";

            return (
              <Card key={report.orderId}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      {isTakeProfit ? (
                        <>
                          <TrendingUp className="h-5 w-5 text-green-600" />
                          Take Profit
                        </>
                      ) : (
                        <>
                          <TrendingDown className="h-5 w-5 text-red-600" />
                          Stop Loss
                        </>
                      )}
                    </CardTitle>
                    {isFilled && (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground">Order ID</p>
                        <p className="font-mono">{report.orderId}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Status</p>
                        {getStatusBadge(report.status)}
                      </div>
                      <div>
                        <p className="text-muted-foreground">
                          {isTakeProfit ? "Target Price" : "Stop Price"}
                        </p>
                        <p className="font-bold">
                          ${(stopPrice || price).toFixed(6)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Limit Price</p>
                        <p className="font-bold">${price.toFixed(6)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Quantity</p>
                        <p className="font-bold">{quantity.toFixed(6)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Executed</p>
                        <p className="font-bold">{executedQty.toFixed(6)}</p>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Execution Progress</span>
                        <span>
                          {((executedQty / quantity) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            isFilled ? "bg-green-500" : "bg-blue-500"
                          }`}
                          style={{
                            width: `${(executedQty / quantity) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          </div>
        )}

        {/* Signal Details Card */}
        {tradeData?.signalId && (
          <Card>
            <CardHeader>
              <CardTitle>Signal Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-muted-foreground">Signal ID</p>
                  <p className="font-mono text-sm">{tradeData.signalId._id}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <div className="mt-1">
                    {tradeData.signalId.status ? (
                      getStatusBadge(tradeData.signalId.status.toUpperCase())
                    ) : (
                      <Badge variant="outline">Unknown</Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Entry Prices */}
              {tradeData.signalId.entries && tradeData.signalId.entries.length > 0 && (
                <div className="mt-6">
                  <p className="text-sm text-muted-foreground mb-2">
                    Entry Prices
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {tradeData.signalId.entries.map((entry, idx) => (
                      <Badge key={idx} variant="outline" className="text-base">
                        ${entry.toFixed(6)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Target Prices */}
              {tradeData.signalId.targets && tradeData.signalId.targets.length > 0 && (
                <div className="mt-6">
                  <p className="text-sm text-muted-foreground mb-2">
                    Target Prices
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {tradeData.signalId.targets.map((target, idx) => (
                      <Badge
                        key={idx}
                        className="bg-green-500 text-white text-base"
                      >
                        Target {idx + 1}: ${target.toFixed(6)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Stop Loss */}
              {tradeData.signalId.stopLoss && (
                <div className="mt-6">
                  <p className="text-sm text-muted-foreground mb-2">Stop Loss</p>
                  <Badge className="bg-red-500 text-white text-base">
                    ${tradeData.signalId.stopLoss.toFixed(6)}
                  </Badge>
                </div>
              )}

              {/* Raw Signal */}
              {tradeData.signalId.rawSignal && (
                <div className="mt-6">
                  <p className="text-sm text-muted-foreground mb-2">
                    Raw Signal Text
                  </p>
                  <div className="bg-muted p-4 rounded-md">
                    <pre className="text-sm whitespace-pre-wrap text-foreground">
                      {tradeData.signalId.rawSignal}
                    </pre>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        {ocoStatus &&
          ocoStatus.listOrderStatus !== "ALL_DONE" &&
          ocoStatus.listOrderStatus !== "CANCELED" && (
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  variant="destructive"
                  onClick={handleCancel}
                  disabled={canceling}
                >
                  {canceling ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4 mr-2" />
                  )}
                  Cancel OCO Order
                </Button>
              </CardContent>
            </Card>
          )}
      </div>
    </DashboardLayout>
  );
}

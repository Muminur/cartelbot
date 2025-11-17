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
} from "lucide-react";
import { toast } from "sonner";

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

export default function OCODetailPage() {
  const router = useRouter();
  const params = useParams();
  const orderListId = params?.orderListId as string;

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [ocoStatus, setOcoStatus] = useState<OCOStatus | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [canceling, setCanceling] = useState(false);

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
        setUser(data.user);
      } catch (error) {
        console.error("Failed to fetch session:", error);
        router.push("/login");
      }
    };
    checkAuth();
  }, [router]);

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
      const res = await fetch(`/api/trades/oco-status/${orderListId}`);
      const data = await res.json();

      if (data.success) {
        setOcoStatus(data.data);
        // Fetch current price
        await fetchCurrentPrice(data.data.symbol);
      } else {
        toast.error(data.error?.message || "Failed to fetch order details");
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

  if (!ocoStatus) {
    return (
      <DashboardLayout userEmail={user?.email || ""}>
        <div className="text-center py-12">
          <p className="text-muted-foreground">OCO order not found</p>
          <Button onClick={() => router.push("/oco")} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to OCO Orders
          </Button>
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

        {/* Overview Card */}
        <Card>
          <CardHeader>
            <CardTitle>Order Overview</CardTitle>
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
                    ${currentPrice.toFixed(2)}
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

        {/* Individual Orders */}
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
                          ${(stopPrice || price).toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Limit Price</p>
                        <p className="font-bold">${price.toFixed(2)}</p>
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

        {/* Actions */}
        {ocoStatus.listOrderStatus !== "ALL_DONE" &&
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

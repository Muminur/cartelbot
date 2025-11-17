"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, Eye, Filter, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";

interface OCOOrder {
  orderListId: number;
  symbol: string;
  orders: Array<{
    orderId: number;
    type: string;
    price: number;
    stopPrice?: number;
    quantity: number;
    status: string;
  }>;
  status: string;
  createdAt: string;
  testnet: boolean;
}

interface PriceData {
  mainnet: number;
  testnet: number;
  mainnetChange: number;
  testnetChange: number;
}

export default function OCOOrdersPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OCOOrder[]>([]);
  const [prices, setPrices] = useState<Map<string, PriceData>>(new Map());
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState({
    symbol: "",
    status: "all",
    network: "all",
  });

  // Use ref to track latest orders without recreating interval
  const ordersRef = useRef<OCOOrder[]>([]);

  // Update ref when orders change
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

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

  // Fetch OCO orders
  const fetchOrders = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        symbol: filters.symbol,
        status: filters.status,
        network: filters.network,
      });

      const res = await fetch(`/api/oco?${params}`);
      const data = await res.json();

      if (data.success) {
        setOrders(data.data);
        // Initial price fetch
        await refreshPrices(data.data);
      } else {
        toast.error(data.error?.message || "Failed to fetch OCO orders");
      }
    } catch (error) {
      console.error("Failed to fetch OCO orders:", error);
      toast.error("Failed to fetch OCO orders");
    } finally {
      setLoading(false);
    }
  }, [user, filters]);

  // Initial fetch when user loads
  useEffect(() => {
    if (!user) return;
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]); // Only run when user changes

  // Refetch when filters change
  useEffect(() => {
    if (!user) return;
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.symbol, filters.status, filters.network, user]); // Run when filters change

  // Refresh prices function
  const refreshPrices = async (ordersData = orders) => {
    if (ordersData.length === 0) return;

    setRefreshing(true);
    try {
      // Get unique symbols
      const symbols = [...new Set(ordersData.map((o) => o.symbol))];

      // Fetch both mainnet and testnet prices in parallel
      const pricePromises = symbols.map(async (symbol) => {
        try {
          const [mainnetRes, testnetRes] = await Promise.all([
            fetch(`/api/binance/ticker?symbol=${symbol}&testnet=false`),
            fetch(`/api/binance/ticker?symbol=${symbol}&testnet=true`),
          ]);

          const mainnetData = await mainnetRes.json();
          const testnetData = await testnetRes.json();

          return {
            symbol,
            mainnet: parseFloat(mainnetData.data?.price || "0"),
            testnet: parseFloat(testnetData.data?.price || "0"),
            mainnetChange: parseFloat(
              mainnetData.data?.priceChangePercent || "0"
            ),
            testnetChange: parseFloat(
              testnetData.data?.priceChangePercent || "0"
            ),
          };
        } catch (error) {
          console.error(`Failed to fetch price for ${symbol}:`, error);
          return {
            symbol,
            mainnet: 0,
            testnet: 0,
            mainnetChange: 0,
            testnetChange: 0,
          };
        }
      });

      const priceData = await Promise.all(pricePromises);
      const priceMap = new Map(priceData.map((p) => [p.symbol, p]));
      setPrices(priceMap);
    } catch (error) {
      console.error("Failed to refresh prices:", error);
    } finally {
      setRefreshing(false);
    }
  };

  // Auto-refresh prices every 10 seconds (create interval once, use ref inside)
  useEffect(() => {
    if (ordersRef.current.length === 0) return;

    const interval = setInterval(() => {
      if (ordersRef.current.length > 0) {
        refreshPrices(ordersRef.current);
      }
    }, 10000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - create interval once

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      NEW: "bg-blue-500 text-white",
      FILLED: "bg-green-500 text-white",
      CANCELED: "bg-gray-500 text-white",
      PARTIALLY_FILLED: "bg-yellow-500 text-white",
    };
    return (
      <Badge className={colors[status] || "bg-gray-500 text-white"}>
        {status}
      </Badge>
    );
  };

  const PriceCell = ({
    priceData,
    isMainnet,
  }: {
    priceData?: PriceData;
    isMainnet: boolean;
  }) => {
    if (!priceData) {
      return <RefreshCw className="h-4 w-4 animate-spin text-gray-400" />;
    }

    const price = isMainnet ? priceData.mainnet : priceData.testnet;
    const change = isMainnet ? priceData.mainnetChange : priceData.testnetChange;
    const isPositive = change >= 0;

    return (
      <div className="space-y-1">
        <div className="font-bold">${price.toFixed(2)}</div>
        <Badge
          className={`${
            isPositive
              ? "bg-green-500 text-white"
              : "bg-red-500 text-white"
          } text-xs flex items-center gap-1 w-fit`}
        >
          {isPositive ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          {isPositive ? "+" : ""}
          {change.toFixed(2)}%
        </Badge>
      </div>
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

  return (
    <DashboardLayout userEmail={user?.email || ""}>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold">OCO Orders</h1>
            <p className="text-muted-foreground">
              View all your One-Cancels-Other orders with live price tracking
            </p>
          </div>
          <Button onClick={fetchOrders} disabled={refreshing}>
            <RefreshCw
              className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                placeholder="Search by symbol (e.g., BTCUSDT)"
                value={filters.symbol}
                onChange={(e) =>
                  setFilters({ ...filters, symbol: e.target.value })
                }
              />
              <Select
                value={filters.status}
                onValueChange={(value) =>
                  setFilters({ ...filters, status: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="NEW">New</SelectItem>
                  <SelectItem value="FILLED">Filled</SelectItem>
                  <SelectItem value="CANCELED">Canceled</SelectItem>
                  <SelectItem value="PARTIALLY_FILLED">
                    Partially Filled
                  </SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filters.network}
                onValueChange={(value) =>
                  setFilters({ ...filters, network: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Networks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Networks</SelectItem>
                  <SelectItem value="mainnet">Mainnet</SelectItem>
                  <SelectItem value="testnet">Testnet</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Orders Table */}
        <Card>
          <CardHeader>
            <CardTitle>OCO Orders ({orders.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order List ID</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Network</TableHead>
                    <TableHead>Mainnet Price</TableHead>
                    <TableHead>Testnet Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => {
                    const priceData = prices.get(order.symbol);
                    return (
                      <TableRow key={order.orderListId}>
                        <TableCell className="font-mono">
                          {order.orderListId}
                        </TableCell>
                        <TableCell className="font-bold">
                          {order.symbol}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              order.testnet
                                ? "bg-orange-100 text-orange-800 border-orange-300"
                                : "bg-green-100 text-green-800 border-green-300"
                            }
                          >
                            {order.testnet ? "TESTNET" : "MAINNET"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <PriceCell priceData={priceData} isMainnet={true} />
                        </TableCell>
                        <TableCell>
                          <PriceCell priceData={priceData} isMainnet={false} />
                        </TableCell>
                        <TableCell>{getStatusBadge(order.status)}</TableCell>
                        <TableCell>
                          {new Date(order.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              router.push(`/oco/${order.orderListId}`)
                            }
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {orders.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                No OCO orders found. Execute a signal to create OCO orders.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

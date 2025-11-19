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
import { RefreshCw, Eye, Filter, TrendingUp, TrendingDown, AlertCircle, Settings } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Type definitions for order types and statuses
type OrderType = "LIMIT_MAKER" | "STOP_LOSS_LIMIT" | "TAKE_PROFIT";
type OrderStatus = "NEW" | "FILLED" | "CANCELED" | "PARTIALLY_FILLED" | "EXECUTING" | "ALL_DONE";

// Session user interface
interface SessionUser {
  _id: string;
  email: string;
  hasApiKeys: boolean;
  subscriptionTier?: string;
}

// Ticker data interface
interface TickerData {
  symbol: string;
  lastPrice?: string;
  price?: string;
  priceChangePercent?: string;
}

interface OCOOrder {
  orderListId: number;
  symbol: string;
  orders: Array<{
    orderId: number;
    type: OrderType;
    price: number;
    stopPrice?: number;
    quantity: number;
    status: OrderStatus;
  }>;
  status: OrderStatus;
  createdAt: string;
  testnet: boolean;
}

interface PriceData {
  mainnet: number;
  testnet: number;
  mainnetChange: number;
  testnetChange: number;
}

// Constants for timeouts and intervals
const PRICE_REFRESH_TIMEOUT_MS = 10_000; // 10 seconds
const AUTO_REFRESH_INTERVAL_MS = 30_000; // 30 seconds

export default function OCOOrdersPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  // M3: FIX - Renamed loading states for clarity
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [orders, setOrders] = useState<OCOOrder[]>([]);
  const [prices, setPrices] = useState<Map<string, PriceData>>(new Map());
  const [apiKeysError, setApiKeysError] = useState<string | null>(null);
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
          setApiKeysError("Binance API keys not configured. Please add them in Settings to view OCO order status.");
        }
      } catch (error) {
        console.error("Failed to fetch session:", error);
        router.push("/login");
      } finally {
        // Always stop loading, regardless of success or failure
        setLoadingOrders(false);
      }
    };
    checkAuth();
  }, [router]);

  // Fetch OCO orders (non-blocking - shows orders immediately)
  const fetchOrders = useCallback(async () => {
    if (!user) {
      // FIX: Ensure loading state is false even when user is not loaded yet
      setLoadingOrders(false);
      return;
    }

    setLoadingOrders(true);
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
        // OPTIMIZATION: Show orders immediately, fetch prices in background
        setLoadingOrders(false);
        // Trigger price fetch separately (non-blocking)
        if (data.data.length > 0) {
          refreshPrices(data.data);
        }
      } else {
        toast.error(data.error?.message || "Failed to fetch OCO orders");
        setLoadingOrders(false);
      }
    } catch (error) {
      console.error("Failed to fetch OCO orders:", error);
      toast.error("Failed to fetch OCO orders");
      setLoadingOrders(false);
    }
  }, [user, filters]);

  // Initial fetch when user loads - automatically fetch orders
  useEffect(() => {
    if (!user) return;
    // When user loads, immediately fetch orders (will set loadingOrders = true)
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]); // Only run when user changes

  // Refetch when filters change
  useEffect(() => {
    if (!user) return;
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.symbol, filters.status, filters.network]); // Run when filters change (user already in dependency via fetchOrders)

  // OPTIMIZED: Refresh prices function using batch API with graceful degradation
  // FIX: Allow partial success (mainnet OR testnet, not both required)
  // H3: FIX - Added AbortController for race condition prevention
  // M2: FIX - Added 10-second timeout
  const refreshPrices = useCallback(async (ordersData = orders, signal?: AbortSignal) => {
    if (ordersData.length === 0) return;

    setRefreshingPrices(true);

    // M2: Create timeout controller
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), PRICE_REFRESH_TIMEOUT_MS);

    // Combine with parent signal if provided
    const combinedSignal = signal || timeoutController.signal;

    try {
      // Get unique symbols
      const symbols = [...new Set(ordersData.map((o) => o.symbol))];

      // OPTIMIZATION: Use batch ticker API (2 requests instead of N×2)
      // FIX: Fetch both networks but allow partial success
      const [mainnetRes, testnetRes] = await Promise.allSettled([
        fetch(
          `/api/binance/ticker/batch?symbols=${encodeURIComponent(JSON.stringify(symbols))}&testnet=false`,
          { signal: combinedSignal }
        ),
        fetch(
          `/api/binance/ticker/batch?symbols=${encodeURIComponent(JSON.stringify(symbols))}&testnet=true`,
          { signal: combinedSignal }
        ),
      ]);

      // H3: Check if aborted before processing
      if (combinedSignal?.aborted) return;

      // FIX: Graceful degradation - accept partial success
      let mainnetData = null;
      let testnetData = null;
      let hasMainnet = false;
      let hasTestnet = false;

      // Try to parse mainnet response
      if (mainnetRes.status === 'fulfilled' && mainnetRes.value.ok) {
        try {
          mainnetData = await mainnetRes.value.json();
          hasMainnet = mainnetData.success;
        } catch (e) {
          console.warn('Failed to parse mainnet response:', e);
        }
      }

      // Try to parse testnet response
      if (testnetRes.status === 'fulfilled' && testnetRes.value.ok) {
        try {
          testnetData = await testnetRes.value.json();
          hasTestnet = testnetData.success;
        } catch (e) {
          console.warn('Failed to parse testnet response:', e);
        }
      }

      // FIX: Show prices if AT LEAST ONE network succeeds
      if (hasMainnet || hasTestnet) {
        // Create price map from batch responses
        const priceMap = new Map<string, PriceData>();

        // Index mainnet data by symbol (if available)
        const mainnetBySymbol = hasMainnet
          ? new Map(mainnetData.data.map((ticker: TickerData) => [ticker.symbol, ticker]))
          : new Map();

        // Index testnet data by symbol (if available)
        const testnetBySymbol = hasTestnet
          ? new Map(testnetData.data.map((ticker: TickerData) => [ticker.symbol, ticker]))
          : new Map();

        // Combine data for each symbol
        symbols.forEach((symbol) => {
          const mainnetTicker = mainnetBySymbol.get(symbol) as TickerData | undefined;
          const testnetTicker = testnetBySymbol.get(symbol) as TickerData | undefined;

          priceMap.set(symbol, {
            mainnet: parseFloat(mainnetTicker?.lastPrice || mainnetTicker?.price || "0"),
            testnet: parseFloat(testnetTicker?.lastPrice || testnetTicker?.price || "0"),
            mainnetChange: parseFloat(mainnetTicker?.priceChangePercent || "0"),
            testnetChange: parseFloat(testnetTicker?.priceChangePercent || "0"),
          });
        });

        setPrices(priceMap);

        // Show info toast if only one network succeeded
        if (hasMainnet && !hasTestnet) {
          toast.info("Mainnet prices loaded. Testnet prices unavailable.", { duration: 3000 });
        } else if (hasTestnet && !hasMainnet) {
          toast.info("Testnet prices loaded. Mainnet prices unavailable.", { duration: 3000 });
        }
      } else {
        // Both networks failed
        console.error("Batch ticker API failed:", {
          mainnet: mainnetRes.status === 'rejected' ? mainnetRes.reason : mainnetData?.error,
          testnet: testnetRes.status === 'rejected' ? testnetRes.reason : testnetData?.error,
        });
        toast.error("Failed to fetch real-time prices from both networks");
      }
    } catch (error) {
      // H3: Ignore abort errors
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('Price fetch timeout or cancelled');
        return;
      }
      console.error("Failed to refresh prices:", error);
      toast.error("Failed to refresh prices");
    } finally {
      clearTimeout(timeoutId);
      if (!combinedSignal?.aborted) {
        setRefreshingPrices(false);
      }
    }
  }, [orders]);

  // OPTIMIZATION: Auto-refresh prices every 30 seconds
  // H3: FIX - Added AbortController cleanup to prevent race conditions
  useEffect(() => {
    if (ordersRef.current.length === 0) return;

    const controller = new AbortController();
    const interval = setInterval(() => {
      if (ordersRef.current.length > 0) {
        refreshPrices(ordersRef.current, controller.signal);
      }
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [refreshPrices]);

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      NEW: "bg-blue-500 text-white",
      FILLED: "bg-green-500 text-white",
      CANCELED: "bg-gray-500 text-white",
      PARTIALLY_FILLED: "bg-yellow-500 text-white",
      EXECUTING: "bg-yellow-500 text-white",
      ALL_DONE: "bg-green-500 text-white",
    };
    return (
      <Badge className={colors[status] || "bg-gray-500 text-white"}>
        {status}
      </Badge>
    );
  };

  // Component to display individual TP/SL orders
  const OrderDetailsCell = ({ orders }: { orders: OCOOrder['orders'] }) => {
    const takeProfitOrders = orders.filter(o => o.type === "LIMIT_MAKER");
    const stopLossOrders = orders.filter(o => o.type === "STOP_LOSS_LIMIT");

    // Show helpful message if no orders are available
    if (orders.length === 0) {
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <AlertCircle className="h-3 w-3" />
          <span>No order details available</span>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {/* Take Profit Orders */}
        {takeProfitOrders.map((order, idx) => (
          <div key={order.orderId} className="flex items-center gap-2">
            <span className="text-xs text-green-600 dark:text-green-400 font-semibold">TP #{idx + 1}:</span>
            <Badge
              className={
                order.status === "FILLED"
                  ? "bg-green-500 text-white text-xs"
                  : order.status === "CANCELED"
                  ? "bg-gray-500 text-white text-xs"
                  : "bg-blue-500 text-white text-xs"
              }
            >
              {order.status === "NEW" ? "" : order.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              @${order.price.toFixed(6)}
            </span>
          </div>
        ))}
        {/* Stop Loss Orders */}
        {stopLossOrders.map((order) => (
          <div key={order.orderId} className="flex items-center gap-2">
            <span className="text-xs text-red-600 dark:text-red-400 font-semibold">SL:</span>
            <Badge
              className={
                order.status === "FILLED"
                  ? "bg-red-500 text-white text-xs"
                  : order.status === "CANCELED"
                  ? "bg-gray-500 text-white text-xs"
                  : "bg-yellow-500 text-white text-xs"
              }
            >
              {order.status === "NEW" ? "" : order.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              @${(order.stopPrice || order.price).toFixed(6)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  // Helper function to get row background color based on overall OCO status
  const getRowClassName = (status: string) => {
    switch (status) {
      case "FILLED":
      case "ALL_DONE":
        return "bg-green-50 hover:bg-green-100 dark:bg-green-950/20 dark:hover:bg-green-950/30";
      case "CANCELED":
        return "bg-gray-50 hover:bg-gray-100 dark:bg-gray-950/20 dark:hover:bg-gray-950/30";
      case "PARTIALLY_FILLED":
      case "EXECUTING":
        return "bg-yellow-50 hover:bg-yellow-100 dark:bg-yellow-950/20 dark:hover:bg-yellow-950/30";
      case "NEW":
        return "bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/20 dark:hover:bg-blue-950/30";
      default:
        return "hover:bg-muted/50";
    }
  };

  const PriceCell = ({
    priceData,
    isMainnet,
  }: {
    priceData?: PriceData;
    isMainnet: boolean;
  }) => {
    if (!priceData) {
      return (
        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">Loading price...</div>
          <RefreshCw className="h-4 w-4 animate-spin text-gray-400" />
        </div>
      );
    }

    const price = isMainnet ? priceData.mainnet : priceData.testnet;
    const change = isMainnet ? priceData.mainnetChange : priceData.testnetChange;
    const isPositive = change >= 0;

    return (
      <div className="space-y-1">
        <div className="font-bold">${price.toFixed(6)}</div>
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

  if (loadingOrders) {
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
              View all your One-Cancels-Other orders with live price tracking (auto-refresh every 30s)
            </p>
          </div>
          <Button
            onClick={fetchOrders}
            disabled={loadingOrders || refreshingPrices}
            aria-label="Refresh OCO orders and prices"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loadingOrders || refreshingPrices ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            Refresh
          </Button>
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
                    <TableHead>Price extracted from Main/Testnet</TableHead>
                    <TableHead>Mainnet Price</TableHead>
                    <TableHead>Testnet Price</TableHead>
                    <TableHead>TP/SL Orders</TableHead>
                    <TableHead>Overall Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => {
                    const priceData = prices.get(order.symbol);
                    return (
                      <TableRow
                        key={order.orderListId}
                        className={getRowClassName(order.status)}
                      >
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
                        <TableCell>
                          <OrderDetailsCell orders={order.orders} />
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
                            aria-label={`View details for OCO order ${order.orderListId} for ${order.symbol}`}
                          >
                            <Eye className="h-4 w-4 mr-2" aria-hidden="true" />
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

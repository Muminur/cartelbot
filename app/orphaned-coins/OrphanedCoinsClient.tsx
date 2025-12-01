"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { API_ROUTES } from "@/lib/constants";
import { formatDate, formatCurrency } from "@/lib/utils/format";
import { RefreshCw, TrendingDown, AlertCircle, Package } from "lucide-react";
import { toast } from "sonner";

interface OrphanedCoin {
  _id: string;
  symbol: string;
  quantity: number;
  buyPrice: number;
  buyOrderId: number;
  buyTimestamp: Date;
  currentMarketPrice: number;
  pnlPercentage: number;
  status: "active" | "sold" | "expired";
  createdAt: Date;
}

interface UserProfile {
  id: string;
  email: string;
  subscriptionTier: "free" | "premium" | "pro";
}

export default function OrphanedCoinsPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [coins, setCoins] = useState<OrphanedCoin[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sellingCoinId, setSellingCoinId] = useState<string | null>(null);

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const response = await fetch(API_ROUTES.AUTH.SESSION);
        const data = await response.json();

        if (!response.ok || !data.success) {
          router.push("/login");
          return;
        }

        setUser(data.data.user);
      } catch {
        router.push("/login");
      }
    };

    fetchSession();
  }, [router]);

  useEffect(() => {
    if (user) {
      fetchOrphanedCoins();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchOrphanedCoins = async () => {
    if (!loading) {
      setRefreshing(true);
    }

    try {
      const response = await fetch("/api/orphaned-coins");
      const data = await response.json();

      if (response.ok && data.success) {
        setCoins(data.data);
      } else {
        toast.error(data.error?.message || "Failed to fetch orphaned coins");
      }
    } catch (error) {
      console.error("Failed to fetch orphaned coins:", error);
      toast.error("An error occurred while fetching orphaned coins");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleSellCoin = async (coinId: string, symbol: string) => {
    if (!confirm(`Are you sure you want to sell this ${symbol} at market price?`)) {
      return;
    }

    setSellingCoinId(coinId);

    try {
      const response = await fetch(`/api/orphaned-coins/${coinId}/sell`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to sell orphaned coin");
      }

      toast.success(data.data.message || "Coin sold successfully");
      fetchOrphanedCoins();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to sell coin";
      toast.error(message);
    } finally {
      setSellingCoinId(null);
    }
  };

  const handleRefresh = () => {
    fetchOrphanedCoins();
  };

  if (loading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <DashboardLayout userEmail={user?.email || ""}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Orphaned Coins</h1>
            <p className="text-muted-foreground mt-1">
              Manage coins from deleted signals with cancelled OCO orders
            </p>
          </div>
          <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
          </div>
        ) : coins.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">No orphaned coins</h3>
                <p className="text-muted-foreground mb-4">
                  You don&apos;t have any orphaned coins from deleted signals.
                </p>
                <p className="text-sm text-muted-foreground/70">
                  When you delete a signal and choose to keep the coins, they will appear here.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Active Orphaned Coins</CardTitle>
              <CardDescription>
                {coins.length} coin{coins.length !== 1 ? "s" : ""} waiting to be sold
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Buy Price</TableHead>
                      <TableHead className="text-right">Current Price</TableHead>
                      <TableHead className="text-right">P&L</TableHead>
                      <TableHead className="text-right">Value (USDT)</TableHead>
                      <TableHead>Buy Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {coins.map((coin) => {
                      const currentValue = coin.currentMarketPrice * coin.quantity;
                      const isProfitable = coin.pnlPercentage > 0;

                      return (
                        <TableRow key={coin._id}>
                          <TableCell className="font-semibold">{coin.symbol}</TableCell>
                          <TableCell className="text-right">
                            {coin.quantity.toFixed(8)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(coin.buyPrice)}
                          </TableCell>
                          <TableCell className="text-right">
                            {coin.currentMarketPrice > 0
                              ? formatCurrency(coin.currentMarketPrice)
                              : "N/A"}
                          </TableCell>
                          <TableCell className="text-right">
                            {coin.currentMarketPrice > 0 ? (
                              <Badge
                                variant="default"
                                className={
                                  isProfitable
                                    ? "bg-green-500 hover:bg-green-600"
                                    : "bg-red-500 hover:bg-red-600"
                                }
                              >
                                {isProfitable ? "+" : ""}
                                {coin.pnlPercentage.toFixed(2)}%
                              </Badge>
                            ) : (
                              <Badge variant="outline">N/A</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {coin.currentMarketPrice > 0
                              ? formatCurrency(currentValue)
                              : "N/A"}
                          </TableCell>
                          <TableCell>{formatDate(coin.buyTimestamp)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              onClick={() => handleSellCoin(coin._id, coin.symbol)}
                              disabled={sellingCoinId === coin._id}
                              className="bg-purple-600 hover:bg-purple-700"
                            >
                              {sellingCoinId === coin._id ? (
                                <>
                                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2" />
                                  Selling...
                                </>
                              ) : (
                                <>
                                  <TrendingDown className="mr-2 h-4 w-4" />
                                  Sell at Market
                                </>
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {coins.length > 0 && (
                <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-amber-900 mb-1">Important Notice</h4>
                      <p className="text-sm text-amber-800">
                        These coins are from deleted signals with cancelled OCO orders. Clicking
                        &quot;Sell at Market&quot; will execute an immediate market sell order. Make sure
                        you review the current market price before selling.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, Settings, AlertCircle, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { isStablecoin } from "@/lib/binance/helpers";
import Link from "next/link";

interface PortfolioAsset {
  asset: string;
  free: string;
  locked: string;
  total: number;
  valueUSDT: number;
  priceChangePercent: string;
  allocation: number;
}

interface PortfolioData {
  totalValueUSDT: number;
  assets: PortfolioAsset[];
  lastUpdated: Date;
}

interface ErrorResponse {
  message: string;
  code?: string;
  requiresSetup?: boolean;
  binanceCode?: number;
}

/**
 * Fetches asset price in USDT by trying multiple quote currencies
 * Priority: USDT > BUSD > BTC > ETH
 * Returns valueUSDT and priceChangePercent
 */
async function getAssetValueInUSDT(
  asset: string,
  balance: number
): Promise<{ valueUSDT: number; priceChangePercent: string }> {
  // Try USDT pair first
  try {
    const usdtResponse = await fetch(`/api/binance/ticker?symbol=${asset}USDT`);
    const usdtData = await usdtResponse.json();

    if (usdtData.success && usdtData.data) {
      const price = parseFloat(usdtData.data.lastPrice);
      return {
        valueUSDT: balance * price,
        priceChangePercent: usdtData.data.priceChangePercent || "0",
      };
    }
  } catch (err) {
    console.warn(`USDT pair not found for ${asset}, trying alternatives`);
  }

  // Try BUSD pair (BUSD ≈ 1 USD)
  try {
    const busdResponse = await fetch(`/api/binance/ticker?symbol=${asset}BUSD`);
    const busdData = await busdResponse.json();

    if (busdData.success && busdData.data) {
      const price = parseFloat(busdData.data.lastPrice);
      return {
        valueUSDT: balance * price, // BUSD ≈ 1 USD
        priceChangePercent: busdData.data.priceChangePercent || "0",
      };
    }
  } catch (err) {
    console.warn(`BUSD pair not found for ${asset}, trying BTC`);
  }

  // Try BTC pair (need to convert BTC to USDT)
  try {
    const [btcPairResponse, btcUsdtResponse] = await Promise.all([
      fetch(`/api/binance/ticker?symbol=${asset}BTC`),
      fetch(`/api/binance/ticker?symbol=BTCUSDT`),
    ]);

    const btcPairData = await btcPairResponse.json();
    const btcUsdtData = await btcUsdtResponse.json();

    if (btcPairData.success && btcPairData.data && btcUsdtData.success && btcUsdtData.data) {
      const btcPrice = parseFloat(btcPairData.data.lastPrice);
      const btcUsdtPrice = parseFloat(btcUsdtData.data.lastPrice);
      return {
        valueUSDT: balance * btcPrice * btcUsdtPrice,
        priceChangePercent: btcPairData.data.priceChangePercent || "0",
      };
    }
  } catch (err) {
    console.warn(`BTC pair not found for ${asset}, trying ETH`);
  }

  // Try ETH pair (need to convert ETH to USDT)
  try {
    const [ethPairResponse, ethUsdtResponse] = await Promise.all([
      fetch(`/api/binance/ticker?symbol=${asset}ETH`),
      fetch(`/api/binance/ticker?symbol=ETHUSDT`),
    ]);

    const ethPairData = await ethPairResponse.json();
    const ethUsdtData = await ethUsdtResponse.json();

    if (ethPairData.success && ethPairData.data && ethUsdtData.success && ethUsdtData.data) {
      const ethPrice = parseFloat(ethPairData.data.lastPrice);
      const ethUsdtPrice = parseFloat(ethUsdtData.data.lastPrice);
      return {
        valueUSDT: balance * ethPrice * ethUsdtPrice,
        priceChangePercent: ethPairData.data.priceChangePercent || "0",
      };
    }
  } catch (err) {
    console.warn(`ETH pair not found for ${asset}`);
  }

  // All quote currencies failed - return 0
  console.warn(`No trading pair found for ${asset}, excluding from portfolio`);
  return { valueUSDT: 0, priceChangePercent: "0" };
}

export function PortfolioWidget() {
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Wrap fetchPortfolio in useCallback to prevent memory leaks
  const fetchPortfolio = useCallback(async () => {
    try {
      setRefreshing(true);
      setError(null);

      // Fetch account balances
      const accountResponse = await fetch("/api/binance/account");
      const accountData = await accountResponse.json();

      if (!accountData.success) {
        const errorData: ErrorResponse = {
          message: accountData.error?.message || "Failed to fetch account data",
          code: accountData.error?.code,
          requiresSetup: accountData.error?.requiresSetup || false,
          binanceCode: accountData.error?.binanceCode,
        };
        setError(errorData);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const balances = accountData.data.balances;

      // Filter out zero balances and calculate total for each asset
      const nonZeroBalances = balances
        .map((balance: { asset: string; free: string; locked: string }) => ({
          ...balance,
          total: parseFloat(balance.free) + parseFloat(balance.locked),
        }))
        .filter((balance: { total: number }) => balance.total > 0);

      // Fetch ticker data for each asset and calculate values (in parallel)
      const assetsWithValues = await Promise.all(
        nonZeroBalances.map(async (balance: { asset: string; free: string; locked: string; total: number }) => {
          let valueUSDT = 0;
          let priceChangePercent = "0";

          // Handle stablecoins - no need to fetch ticker data
          if (isStablecoin(balance.asset)) {
            valueUSDT = balance.total;
            priceChangePercent = "0";
          } else {
            // Fetch ticker for non-stablecoin assets with fallback to alternative quote currencies
            const result = await getAssetValueInUSDT(balance.asset, balance.total);
            valueUSDT = result.valueUSDT;
            priceChangePercent = result.priceChangePercent;
          }

          return {
            asset: balance.asset,
            free: balance.free,
            locked: balance.locked,
            total: balance.total,
            valueUSDT,
            priceChangePercent,
            allocation: 0, // Will calculate after total is known
          };
        })
      );

      // Filter out dust (assets worth less than 0.01 USDT) and assets with no value
      const significantAssets = assetsWithValues.filter(
        (asset) => asset.valueUSDT >= 0.01
      );

      // If all assets filtered out but we had balances, show helpful error
      if (significantAssets.length === 0 && nonZeroBalances.length > 0) {
        // Check if it's because no prices were found vs all are dust
        const assetsWithoutPrice = assetsWithValues.filter(
          (asset) => asset.valueUSDT === 0 && !isStablecoin(asset.asset)
        );

        if (assetsWithoutPrice.length > 0) {
          setError({
            message: `Unable to fetch prices for ${assetsWithoutPrice.length} asset(s). Your portfolio may contain assets without USDT trading pairs.`,
            code: "NO_PRICES_FOUND",
          });
        }
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Calculate total portfolio value
      const totalValue = significantAssets.reduce(
        (sum, asset) => sum + asset.valueUSDT,
        0
      );

      // Calculate allocation percentages
      const assetsWithAllocation = significantAssets.map((asset) => ({
        ...asset,
        allocation: totalValue > 0 ? (asset.valueUSDT / totalValue) * 100 : 0,
      }));

      // Sort by value (descending)
      const sortedAssets = assetsWithAllocation.sort(
        (a, b) => b.valueUSDT - a.valueUSDT
      );

      setPortfolio({
        totalValueUSDT: totalValue,
        assets: sortedAssets,
        lastUpdated: new Date(),
      });

      setError(null);
    } catch (error) {
      console.error("Error fetching portfolio:", error);
      setError({
        message: "Failed to fetch portfolio data. Please try again.",
        code: "FETCH_ERROR",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []); // Empty dependencies - function is stable

  useEffect(() => {
    fetchPortfolio();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchPortfolio, 30000);

    return () => clearInterval(interval);
  }, [fetchPortfolio]); // Add fetchPortfolio as dependency

  const handleRefresh = () => {
    if (!refreshing) {
      fetchPortfolio();
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5" />
            Portfolio Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Handle "No API keys configured" scenario
  if (error?.code === "NO_API_KEYS" || error?.requiresSetup) {
    return (
      <Card className="border-yellow-200 bg-yellow-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-yellow-600" />
            Portfolio Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
            <p className="text-sm text-gray-700 mb-4">{error.message}</p>
            <Link href="/settings">
              <Button variant="default" size="sm" className="gap-2">
                <Settings className="w-4 h-4" />
                Configure API Keys
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Handle other errors
  if (error) {
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-red-600" />
            Portfolio Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <p className="text-sm text-red-700 mb-3">{error.message}</p>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Success state - show portfolio
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5" />
            Portfolio Overview
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!portfolio || portfolio.assets.length === 0 ? (
          <div className="text-center py-6">
            <Wallet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No assets in portfolio</p>
            <p className="text-xs text-gray-400 mt-1">
              Deposit funds to your Binance account to start trading
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Total Portfolio Value */}
            <div className="p-4 rounded-lg bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-100">
              <p className="text-sm text-gray-600 mb-1">Total Portfolio Value</p>
              <p className="text-2xl font-bold text-purple-900">
                {formatCurrency(portfolio.totalValueUSDT)} USDT
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Last updated: {portfolio.lastUpdated.toLocaleTimeString()}
              </p>
            </div>

            {/* Assets List */}
            <div className="space-y-2">
              {portfolio.assets.map((asset) => {
                const priceChange = parseFloat(asset.priceChangePercent);
                const isPositive = priceChange >= 0;

                return (
                  <div
                    key={asset.asset}
                    className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium">{asset.asset}</p>
                        <div
                          className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                            isPositive
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {isPositive ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          {isPositive ? "+" : ""}
                          {priceChange.toFixed(2)}%
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>Balance: {asset.total.toFixed(8)}</span>
                        {parseFloat(asset.locked) > 0 && (
                          <span className="text-amber-600">
                            Locked: {parseFloat(asset.locked).toFixed(8)}
                          </span>
                        )}
                        <span className="text-purple-600">
                          {asset.allocation.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">
                        {formatCurrency(asset.valueUSDT)}
                      </p>
                      <p className="text-xs text-gray-500">USDT</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

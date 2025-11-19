"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wallet, Settings, AlertCircle, TrendingUp, TrendingDown, RefreshCw, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { isStablecoin } from "@/lib/utils/stablecoins";
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
 * Mapping of common cryptocurrency symbols to their full names
 * Used for enhanced search functionality (search by name or symbol)
 */
const COIN_NAMES: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  BNB: 'Binance Coin',
  USDT: 'Tether',
  USDC: 'USD Coin',
  BUSD: 'Binance USD',
  XRP: 'Ripple',
  ADA: 'Cardano',
  DOGE: 'Dogecoin',
  SOL: 'Solana',
  DOT: 'Polkadot',
  MATIC: 'Polygon',
  LTC: 'Litecoin',
  AVAX: 'Avalanche',
  LINK: 'Chainlink',
  UNI: 'Uniswap',
  ATOM: 'Cosmos',
  XLM: 'Stellar',
  ALGO: 'Algorand',
  VET: 'VeChain',
  ICP: 'Internet Computer',
  FIL: 'Filecoin',
  TRX: 'TRON',
  ETC: 'Ethereum Classic',
  XMR: 'Monero',
  NEAR: 'NEAR Protocol',
  APT: 'Aptos',
  ARB: 'Arbitrum',
  OP: 'Optimism',
  SUI: 'Sui',
};

/**
 * Get full name for a cryptocurrency symbol
 * Returns the symbol itself if no mapping exists
 */
function getCoinName(symbol: string): string {
  return COIN_NAMES[symbol] || symbol;
}

/**
 * Custom hook for debouncing values
 * Delays updating the debounced value until after the specified delay
 * Useful for search inputs to reduce unnecessary re-renders
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set up a timer to update the debounced value after the delay
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Clean up the timer if value changes before delay expires
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Constants for portfolio filtering and retry logic
const DUST_THRESHOLD_USDT = 0.001; // Assets below this value are filtered out
const MAX_INDIVIDUAL_RETRY_ASSETS = 4; // Limit individual retries to prevent API abuse

/**
 * Fetches asset price in USDT by trying multiple quote currencies
 * Priority: USDT (direct) → BTC (conversion) → ETH (conversion) → BNB (conversion)
 * BUSD removed - delisted in Feb 2024
 * Returns valueUSDT and priceChangePercent
 *
 * @param asset - The asset symbol (e.g., "BTC", "ETH")
 * @param balance - The total balance of the asset
 * @param signal - Optional AbortSignal for request cancellation
 */
async function getAssetValueInUSDT(
  asset: string,
  balance: number,
  signal?: AbortSignal
): Promise<{ valueUSDT: number; priceChangePercent: string }> {
  // Try USDT pair first (99% of assets have this)
  try {
    const usdtResponse = await fetch(`/api/binance/ticker?symbol=${asset}USDT`, { signal });
    const usdtData = await usdtResponse.json();

    if (usdtData.success && usdtData.data) {
      const price = parseFloat(usdtData.data.price || usdtData.data.lastPrice);
      return {
        valueUSDT: balance * price,
        priceChangePercent: usdtData.data.priceChangePercent || "0",
      };
    }
  } catch (err) {
    console.warn(`[Portfolio] ${asset}USDT fetch failed:`, err);
  }

  // Fallback 1: Try BTC conversion
  try {
    const [btcPairRes, btcUsdtRes] = await Promise.all([
      fetch(`/api/binance/ticker?symbol=${asset}BTC`, { signal }),
      fetch(`/api/binance/ticker?symbol=BTCUSDT`, { signal }),
    ]);

    if (btcPairRes.ok && btcUsdtRes.ok) {
      const btcPairData = await btcPairRes.json();
      const btcUsdtData = await btcUsdtRes.json();

      if (btcPairData.success && btcUsdtData.success) {
        const btcPrice = parseFloat(btcPairData.data.price || btcPairData.data.lastPrice);
        const btcUsdtPrice = parseFloat(btcUsdtData.data.price || btcUsdtData.data.lastPrice);

        return {
          valueUSDT: balance * btcPrice * btcUsdtPrice,
          priceChangePercent: btcPairData.data.priceChangePercent || "0",
        };
      }
    }
  } catch (err) {
    console.warn(`[Portfolio] ${asset}BTC conversion failed:`, err);
  }

  // Fallback 2: Try ETH conversion
  try {
    const [ethPairRes, ethUsdtRes] = await Promise.all([
      fetch(`/api/binance/ticker?symbol=${asset}ETH`, { signal }),
      fetch(`/api/binance/ticker?symbol=ETHUSDT`, { signal }),
    ]);

    if (ethPairRes.ok && ethUsdtRes.ok) {
      const ethPairData = await ethPairRes.json();
      const ethUsdtData = await ethUsdtRes.json();

      if (ethPairData.success && ethUsdtData.success) {
        const ethPrice = parseFloat(ethPairData.data.price || ethPairData.data.lastPrice);
        const ethUsdtPrice = parseFloat(ethUsdtData.data.price || ethUsdtData.data.lastPrice);

        return {
          valueUSDT: balance * ethPrice * ethUsdtPrice,
          priceChangePercent: ethPairData.data.priceChangePercent || "0",
        };
      }
    }
  } catch (err) {
    console.warn(`[Portfolio] ${asset}ETH conversion failed:`, err);
  }

  // No valid pairs found
  console.warn(`[Portfolio] No trading pair found for ${asset}, excluding from portfolio`);
  return { valueUSDT: 0, priceChangePercent: "0" };
}

export function PortfolioWidget() {
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Debounce search query to avoid excessive re-renders (300ms delay)
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Wrap fetchPortfolio in useCallback to prevent memory leaks
  const fetchPortfolio = useCallback(async (signal?: AbortSignal) => {
    try {
      setRefreshing(true);
      setError(null);

      // Fetch account balances with abort signal for cleanup
      const accountResponse = await fetch("/api/binance/account", { signal });
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

      // Build list of all symbols to fetch (batch optimization)
      const symbolsToFetch = new Set<string>();
      const nonStablecoinBalances = nonZeroBalances.filter((b: { asset: string }) => !isStablecoin(b.asset));

      console.log('[Portfolio] Asset breakdown:', {
        totalAssets: nonZeroBalances.length,
        stablecoins: nonZeroBalances.filter((b: { asset: string }) => isStablecoin(b.asset)).map((b: { asset: string }) => b.asset),
        nonStablecoins: nonStablecoinBalances.map((b: { asset: string }) => b.asset)
      });

      // Major coins that usually have BTC/ETH/BNB pairs for redundancy
      const MAJOR_COINS = ['BTC', 'ETH', 'BNB', 'SOL', 'ADA', 'XRP', 'DOT', 'LINK', 'MATIC', 'UNI'];

      nonStablecoinBalances.forEach((balance: { asset: string }) => {
        const asset = balance.asset;

        // Always try USDT pair first (most common after BUSD delisting in Feb 2024)
        symbolsToFetch.add(`${asset}USDT`);

        // For major coins, include conversion pairs for redundancy
        if (MAJOR_COINS.includes(asset)) {
          // These usually have BTC/ETH/BNB pairs
          if (asset !== 'BTC') {
            symbolsToFetch.add(`${asset}BTC`);
            // Need BTCUSDT for conversion
            symbolsToFetch.add('BTCUSDT');
          }
          if (asset !== 'ETH') {
            symbolsToFetch.add(`${asset}ETH`);
            // Need ETHUSDT for conversion
            symbolsToFetch.add('ETHUSDT');
          }
          if (asset !== 'BNB') {
            symbolsToFetch.add(`${asset}BNB`);
            // Need BNBUSDT for conversion
            symbolsToFetch.add('BNBUSDT');
          }
        }
      });

      // Fetch all tickers in ONE batch call (performance optimization)
      let tickerMap = new Map<string, { price: number; change: string }>();

      if (symbolsToFetch.size > 0) {
        try {
          console.log('[Portfolio] Requesting tickers for symbols:', Array.from(symbolsToFetch));

          const encodedSymbols = encodeURIComponent(JSON.stringify([...symbolsToFetch]));
          const tickerResponse = await fetch(`/api/binance/ticker/batch?symbols=${encodedSymbols}`, { signal });
          const tickerData = await tickerResponse.json();

          console.log('[Portfolio] Batch ticker API response:', {
            success: tickerData.success,
            dataCount: tickerData.data?.length || 0,
            requestedSymbols: symbolsToFetch.size,
            meta: tickerData.meta,
            error: tickerData.error
          });

          if (tickerData.success && tickerData.data) {
            tickerData.data.forEach((ticker: { symbol: string; lastPrice: string; priceChangePercent: string }) => {
              tickerMap.set(ticker.symbol, {
                price: parseFloat(ticker.lastPrice),
                change: ticker.priceChangePercent || "0",
              });
            });

            // Debug logging for ticker map contents (dev only)
            if (process.env.NODE_ENV === 'development') {
              console.log('[Portfolio] Ticker map populated:', {
                tickerMapSize: tickerMap.size,
                symbols: Array.from(tickerMap.keys())
              });
            } else {
              console.log(`[Portfolio] Ticker map populated with ${tickerMap.size} symbols`);
            }
          } else {
            console.error('[Portfolio] Batch ticker API failed:', tickerData.error);
            // Set error state to show user-friendly message
            if (!error) {
              setError({
                message: "Unable to fetch real-time prices from Binance. Please refresh the page or try again later.",
                code: "BATCH_TICKER_FAILED",
              });
            }
          }
        } catch (err) {
          console.error("[Portfolio] Batch ticker API failed:", err);
          // Set error state to show user-friendly message
          if (!error) {
            setError({
              message: "Unable to fetch real-time prices from Binance. Please refresh the page or try again later.",
              code: "BATCH_TICKER_FAILED",
            });
          }
        }

        // Warn if ticker map is empty after attempt
        if (tickerMap.size === 0 && symbolsToFetch.size > 0) {
          console.warn('[Portfolio] Ticker map is empty - batch ticker may have failed');
        }
      }

      // Calculate values using batch-fetched tickers
      // Use Promise.allSettled to prevent single failure from breaking entire portfolio
      const settledResults = await Promise.allSettled(
        nonZeroBalances.map(async (balance: { asset: string; free: string; locked: string; total: number }) => {
          let valueUSDT = 0;
          let priceChangePercent = "0";

          // Handle stablecoins - no need to fetch ticker data
          if (isStablecoin(balance.asset)) {
            valueUSDT = balance.total;
            priceChangePercent = "0";
          } else if (tickerMap.size > 0) {
            // Use batch-fetched tickers (fast path)
            // Priority: USDT (direct) → BTC (conversion) → ETH (conversion)
            const usdtPair = tickerMap.get(`${balance.asset}USDT`);
            if (usdtPair) {
              valueUSDT = balance.total * usdtPair.price;
              priceChangePercent = usdtPair.change;
              console.log(`[Portfolio] ${balance.asset}: Found USDT pair, value=${valueUSDT.toFixed(2)}`);
            } else {
              // Try BTC conversion
              const btcPair = tickerMap.get(`${balance.asset}BTC`);
              const btcUsdt = tickerMap.get("BTCUSDT");
              if (btcPair && btcUsdt) {
                valueUSDT = balance.total * btcPair.price * btcUsdt.price;
                priceChangePercent = btcPair.change;
                console.log(`[Portfolio] ${balance.asset}: Found BTC pair, value=${valueUSDT.toFixed(2)}`);
              } else {
                // Try ETH conversion
                const ethPair = tickerMap.get(`${balance.asset}ETH`);
                const ethUsdt = tickerMap.get("ETHUSDT");
                if (ethPair && ethUsdt) {
                  valueUSDT = balance.total * ethPair.price * ethUsdt.price;
                  priceChangePercent = ethPair.change;
                  console.log(`[Portfolio] ${balance.asset}: Found ETH pair, value=${valueUSDT.toFixed(2)}`);
                } else {
                  // Try BNB conversion (Nov 19, 2025 - added fallback)
                  const bnbPair = tickerMap.get(`${balance.asset}BNB`);
                  const bnbUsdt = tickerMap.get("BNBUSDT");
                  if (bnbPair && bnbUsdt) {
                    valueUSDT = balance.total * bnbPair.price * bnbUsdt.price;
                    priceChangePercent = bnbPair.change;
                    console.log(`[Portfolio] ${balance.asset}: Found BNB pair, value=${valueUSDT.toFixed(2)}`);
                  } else {
                    // Asset not in batch ticker response - will retry with individual requests
                    console.warn(`[Portfolio] ${balance.asset}: Not found in batch ticker response`);
                    valueUSDT = 0;
                    priceChangePercent = "0";
                  }
                }
              }
            }
          } else {
            // Asset not found in ticker map - could be batch failure or missing pair
            if (tickerMap.size === 0) {
              // Batch ticker completely failed (no data for any assets)
              // Don't log per asset - batch failure already logged at line 316/326
              valueUSDT = 0;
              priceChangePercent = "0";
            } else {
              // Batch succeeded but this specific asset not found
              // This is expected for exotic assets without USDT/BTC/ETH pairs
              // Only log in development mode to avoid console spam
              if (process.env.NODE_ENV === 'development') {
                console.warn(
                  `[Portfolio] ${balance.asset}: Not found in ticker map. ` +
                  `Asset may not have USDT/BTC/ETH trading pairs on Binance.`
                );
              }
              valueUSDT = 0;
              priceChangePercent = "0";
            }
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

      // Extract successful results from Promise.allSettled
      const assetsWithValues = settledResults
        .filter((result): result is PromiseFulfilledResult<PortfolioAsset> => result.status === 'fulfilled')
        .map(result => result.value);

      // Smart retry: Only for missing assets (not full batch failure)
      const assetsMissingPrice = assetsWithValues.filter(
        (asset: PortfolioAsset) =>
          asset.valueUSDT === 0 &&
          !isStablecoin(asset.asset) &&
          tickerMap.size > 0  // Only if batch succeeded but assets missing
      );

      // Only retry if reasonable number to avoid API abuse
      if (assetsMissingPrice.length > 0 && assetsMissingPrice.length <= MAX_INDIVIDUAL_RETRY_ASSETS) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[Portfolio] Retrying ${assetsMissingPrice.length} assets with individual requests:`,
            assetsMissingPrice.map(a => a.asset).join(', '));
        }

        const fallbackResults = await Promise.allSettled(
          assetsMissingPrice.map(asset =>
            getAssetValueInUSDT(asset.asset, asset.total, signal)
              .then(result => ({ asset: asset.asset, ...result }))
          )
        );

        fallbackResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            const assetIndex = assetsWithValues.findIndex(
              (a: PortfolioAsset) => a.asset === result.value.asset
            );
            if (assetIndex !== -1) {
              assetsWithValues[assetIndex].valueUSDT = result.value.valueUSDT;
              assetsWithValues[assetIndex].priceChangePercent = result.value.priceChangePercent;
              console.log(`[Portfolio] ${result.value.asset}: Fallback successful, value=${result.value.valueUSDT.toFixed(2)}`);
            }
          } else {
            console.warn(`[Portfolio] ${assetsMissingPrice[index].asset}: Fallback failed`);
          }
        });
      } else if (assetsMissingPrice.length > MAX_INDIVIDUAL_RETRY_ASSETS) {
        // Warn about skipped assets (only in development to avoid production console spam)
        if (process.env.NODE_ENV === 'development') {
          console.warn(
            `[Portfolio] ${assetsMissingPrice.length} assets missing price (>${4} retry limit). ` +
            `Assets: ${assetsMissingPrice.map(a => a.asset).join(', ')}`
          );
        }
      }

      // Filter out dust using configured threshold
      // Changed from 0.01 to 0.001 to show more assets (Nov 19, 2025)
      const significantAssets = assetsWithValues.filter(
        (asset: PortfolioAsset) => asset.valueUSDT >= DUST_THRESHOLD_USDT
      );

      // Diagnostic logging for asset filtering (Nov 19, 2025)
      // Only log in development or when issues occur for production clarity
      const excludedDust = assetsWithValues.filter(a => a.valueUSDT > 0 && a.valueUSDT < DUST_THRESHOLD_USDT);
      const excludedNoPrice = assetsWithValues.filter(a => a.valueUSDT === 0 && !isStablecoin(a.asset));

      if (process.env.NODE_ENV === 'development' || significantAssets.length === 0) {
        console.log('[Portfolio] Asset filtering summary:', {
          totalAssets: assetsWithValues.length,
          displayed: significantAssets.length,
          filteredTotal: assetsWithValues.length - significantAssets.length,
          excludedDust: excludedDust.length,
          excludedNoPriceCount: excludedNoPrice.length,
          excludedNoPriceAssets: excludedNoPrice.map(a => a.asset).join(', ') || 'none'
        });
      }

      // If all assets filtered out but we had balances, show helpful error
      if (significantAssets.length === 0 && nonZeroBalances.length > 0) {
        // Check if it's because no prices were found vs all are dust
        const assetsWithoutPrice = assetsWithValues.filter(
          (asset: PortfolioAsset) => asset.valueUSDT === 0 && !isStablecoin(asset.asset)
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
        (sum: number, asset: PortfolioAsset) => sum + asset.valueUSDT,
        0
      );

      // Calculate allocation percentages
      const assetsWithAllocation = significantAssets.map((asset: PortfolioAsset) => ({
        ...asset,
        allocation: totalValue > 0 ? (asset.valueUSDT / totalValue) * 100 : 0,
      }));

      // Sort by value (descending)
      const sortedAssets = assetsWithAllocation.sort(
        (a: PortfolioAsset, b: PortfolioAsset) => b.valueUSDT - a.valueUSDT
      );

      setPortfolio({
        totalValueUSDT: totalValue,
        assets: sortedAssets,
        lastUpdated: new Date(),
      });

      setError(null);
    } catch (error) {
      // Ignore abort errors (component unmounted during fetch)
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
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
    // Create AbortController for cleanup on unmount
    const abortController = new AbortController();

    fetchPortfolio(abortController.signal);

    // Auto-refresh every 30 seconds with abort signal
    const interval = setInterval(() => {
      fetchPortfolio(abortController.signal);
    }, 30000);

    // Cleanup: abort ongoing requests and clear interval
    return () => {
      abortController.abort();
      clearInterval(interval);
    };
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
            <p className="text-sm text-foreground mb-4">{error.message}</p>
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
              <p className="text-sm text-muted-foreground mb-1">Total Portfolio Value</p>
              <p className="text-2xl font-bold text-purple-900">
                {formatCurrency(portfolio.totalValueUSDT)} USDT
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Last updated: {portfolio.lastUpdated.toLocaleTimeString()}
              </p>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search by symbol or name (e.g., BTC or Bitcoin)..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1); // Reset to first page on search
                }}
                className="pl-10"
              />
            </div>

            {/* Assets List */}
            <div className="space-y-2">
              {(() => {
                // Filter assets by debounced search query (prevents excessive re-renders)
                // Search matches both symbol (BTC) and full name (Bitcoin)
                const filteredAssets = portfolio.assets.filter((asset) => {
                  const searchLower = debouncedSearchQuery.toLowerCase();
                  const symbolLower = asset.asset.toLowerCase();
                  const fullName = getCoinName(asset.asset).toLowerCase();

                  return symbolLower.includes(searchLower) || fullName.includes(searchLower);
                });

                // Calculate pagination
                const totalPages = Math.ceil(filteredAssets.length / itemsPerPage);
                // Ensure current page is within valid range
                const validPage = Math.min(currentPage, Math.max(1, totalPages));
                const startIndex = (validPage - 1) * itemsPerPage;
                const endIndex = startIndex + itemsPerPage;
                const paginatedAssets = filteredAssets.slice(startIndex, endIndex);

                if (filteredAssets.length === 0) {
                  return (
                    <div className="text-center py-6">
                      <Search className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">No assets found matching &quot;{debouncedSearchQuery}&quot;</p>
                    </div>
                  );
                }

                return (
                  <>
                    {paginatedAssets.map((asset) => {
                      const priceChange = parseFloat(asset.priceChangePercent);
                      const isPositive = priceChange >= 0;

                      return (
                        <div
                          key={asset.asset}
                          className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <div>
                                <p className="font-medium">{asset.asset}</p>
                                {getCoinName(asset.asset) !== asset.asset && (
                                  <p className="text-xs text-gray-500">{getCoinName(asset.asset)}</p>
                                )}
                              </div>
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
                            <p className="font-semibold text-foreground">
                              {formatCurrency(asset.valueUSDT)}
                            </p>
                            <p className="text-xs text-gray-500">USDT</p>
                          </div>
                        </div>
                      );
                    })}

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between pt-4 border-t">
                        <p className="text-sm text-muted-foreground">
                          Showing {startIndex + 1}-{Math.min(endIndex, filteredAssets.length)} of {filteredAssets.length} assets
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                            disabled={validPage === 1}
                            className="h-8 px-2"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <span className="text-sm text-muted-foreground">
                            Page {validPage} of {totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                            disabled={validPage === totalPages}
                            className="h-8 px-2"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

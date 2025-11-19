"use client";

/**
 * Portfolio Widget - Pure Presentation Component
 *
 * This component is responsible ONLY for displaying portfolio data.
 * All data fetching logic has been moved to usePortfolioData hook.
 *
 * Features:
 * - Search with React 19 useTransition (non-blocking)
 * - Pagination (5 items per page)
 * - Asset filtering and sorting
 * - Responsive design
 */

import { useState, useMemo, useTransition, ChangeEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Wallet,
  Settings,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { isStablecoin } from '@/lib/utils/stablecoins';
import Link from 'next/link';
import { usePortfolioData, type PortfolioAsset } from '@/hooks/usePortfolioData';

// Coin name mappings for enhanced search
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

function getCoinName(symbol: string): string {
  return COIN_NAMES[symbol] || symbol;
}

interface PortfolioWidgetProps {
  onRefresh?: () => void;
}

export function PortfolioWidget({ onRefresh }: PortfolioWidgetProps) {
  // Data fetching hook (handles all API calls)
  const { data: portfolio, loading, refreshing, error, refetch } = usePortfolioData({
    autoRefresh: true,
    refreshInterval: 30000,
  });

  // Local UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  const itemsPerPage = 5;

  // Handle search with React 19 useTransition (non-blocking UI)
  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);

    // Update filtered results in background (won't block input)
    startTransition(() => {
      setDebouncedQuery(value);
      setCurrentPage(1); // Reset to first page
    });
  };

  // Handle manual refresh
  const handleRefresh = () => {
    refetch();
    onRefresh?.();
  };

  // Filter and paginate assets (memoized for performance)
  const { filteredAssets, paginatedAssets, totalPages, validPage } = useMemo(() => {
    if (!portfolio) {
      return {
        filteredAssets: [],
        paginatedAssets: [],
        totalPages: 0,
        validPage: 1,
      };
    }

    // Filter by search query (symbol or full name)
    const filtered = portfolio.assets.filter(asset => {
      const searchLower = debouncedQuery.toLowerCase();
      const symbolLower = asset.asset.toLowerCase();
      const fullName = getCoinName(asset.asset).toLowerCase();

      return symbolLower.includes(searchLower) || fullName.includes(searchLower);
    });

    // Calculate pagination
    const pages = Math.ceil(filtered.length / itemsPerPage);
    const safePage = Math.min(currentPage, Math.max(1, pages));
    const startIndex = (safePage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginated = filtered.slice(startIndex, endIndex);

    return {
      filteredAssets: filtered,
      paginatedAssets: paginated,
      totalPages: pages,
      validPage: safePage,
    };
  }, [portfolio, debouncedQuery, currentPage]);

  // Loading state
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

  // Error state - No API keys configured
  if (error?.code === 'NO_API_KEYS' || error?.requiresSetup) {
    return (
      <Card className="border-yellow-200 bg-yellow-50/50 dark:border-yellow-800 dark:bg-yellow-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            Portfolio Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
              {error.message}
            </p>
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

  // Error state - Other errors
  if (error) {
    return (
      <Card className="border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-red-600 dark:text-red-400" />
            Portfolio Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <p className="text-sm text-red-700 dark:text-red-300 mb-3">
              {error.message}
            </p>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Success state - Show portfolio
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
            aria-label="Refresh portfolio"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!portfolio || portfolio.assets.length === 0 ? (
          <div className="text-center py-6">
            <Wallet className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No assets in portfolio
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Deposit funds to your Binance account to start trading
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Total Portfolio Value */}
            <div className="p-4 rounded-lg bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 border border-purple-100 dark:border-purple-800">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                Total Portfolio Value
              </p>
              <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                {formatCurrency(portfolio.totalValueUSDT)} USDT
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
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
                onChange={handleSearchChange}
                className="pl-10"
                aria-label="Search assets"
              />
              {isPending && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400" />
                </div>
              )}
            </div>

            {/* Assets List */}
            <div className="space-y-2">
              {filteredAssets.length === 0 ? (
                <div className="text-center py-6">
                  <Search className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No assets found matching &quot;{debouncedQuery}&quot;
                  </p>
                </div>
              ) : (
                <>
                  {paginatedAssets.map(asset => {
                    const priceChange = parseFloat(asset.priceChangePercent);
                    const isPositive = priceChange >= 0;

                    return (
                      <div
                        key={asset.asset}
                        className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <div>
                              <p className="font-medium text-gray-900 dark:text-gray-100">
                                {asset.asset}
                              </p>
                              {getCoinName(asset.asset) !== asset.asset && (
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {getCoinName(asset.asset)}
                                </p>
                              )}
                            </div>
                            <div
                              className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                                isPositive
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                              }`}
                            >
                              {isPositive ? (
                                <TrendingUp className="w-3 h-3" />
                              ) : (
                                <TrendingDown className="w-3 h-3" />
                              )}
                              {isPositive ? '+' : ''}
                              {priceChange.toFixed(2)}%
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                            <span>Balance: {asset.total.toFixed(8)}</span>
                            {parseFloat(asset.locked) > 0 && (
                              <span className="text-amber-600 dark:text-amber-400">
                                Locked: {parseFloat(asset.locked).toFixed(8)}
                              </span>
                            )}
                            <span className="text-purple-600 dark:text-purple-400">
                              {asset.allocation.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900 dark:text-gray-100">
                            {formatCurrency(asset.valueUSDT)}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">USDT</p>
                        </div>
                      </div>
                    );
                  })}

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4 border-t dark:border-gray-700">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Showing {(validPage - 1) * itemsPerPage + 1}-
                        {Math.min(validPage * itemsPerPage, filteredAssets.length)} of{' '}
                        {filteredAssets.length} assets
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={validPage === 1}
                          className="h-8 px-2"
                          aria-label="Previous page"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          Page {validPage} of {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={validPage === totalPages}
                          className="h-8 px-2"
                          aria-label="Next page"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

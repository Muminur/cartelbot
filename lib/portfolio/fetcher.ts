/**
 * Portfolio Data Fetching Logic
 *
 * Centralized business logic for fetching and processing portfolio data.
 * Separated from UI components for better testability and maintainability.
 */

import { isStablecoin } from '@/lib/utils/stablecoins';
import type { PortfolioData, PortfolioAsset } from '@/hooks/usePortfolioData';

// Constants
const DUST_THRESHOLD_USDT = 0.001;
const MAX_INDIVIDUAL_RETRY_ASSETS = 4;
const MAJOR_COINS = ['BTC', 'ETH', 'BNB', 'SOL', 'ADA', 'XRP', 'DOT', 'LINK', 'MATIC', 'UNI'];

// Cache for conversion rates (BTC/ETH/BNB prices change slowly)
const conversionRatesCache = {
  BTCUSDT: 0,
  ETHUSDT: 0,
  BNBUSDT: 0,
  lastUpdated: 0,
};

interface BalanceData {
  asset: string;
  free: string;
  locked: string;
  total: number;
}

interface TickerData {
  price: number;
  change: string;
}

/**
 * Fetch portfolio data from Binance API with batch optimization
 */
export async function fetchPortfolioData(signal?: AbortSignal): Promise<PortfolioData> {
  // Step 1: Fetch account balances
  const accountResponse = await fetch('/api/binance/account', { signal });
  const accountData = await accountResponse.json();

  if (!accountData.success) {
    throw new Error(accountData.error?.message || 'Failed to fetch account data');
  }

  const balances: BalanceData[] = accountData.data.balances;

  // Step 2: Filter non-zero balances
  const nonZeroBalances = balances
    .map(balance => ({
      ...balance,
      total: parseFloat(balance.free) + parseFloat(balance.locked),
    }))
    .filter(balance => balance.total > 0);

  const nonStablecoinBalances = nonZeroBalances.filter(
    b => !isStablecoin(b.asset)
  );

  // Step 3: Build symbol list for batch ticker request
  const symbolsToFetch = buildSymbolList(nonStablecoinBalances);

  // Step 4: Fetch tickers in batch
  const tickerMap = await fetchBatchTickers(symbolsToFetch, signal);

  // Step 5: Calculate asset values
  const assetsWithValues = await Promise.all(
    nonZeroBalances.map(balance => calculateAssetValue(balance, tickerMap, signal))
  );

  // Step 6: Retry failed assets individually (if reasonable number)
  await retryFailedAssets(assetsWithValues, tickerMap, signal);

  // Step 7: Filter and sort assets
  const significantAssets = assetsWithValues.filter(
    asset => asset.valueUSDT >= DUST_THRESHOLD_USDT
  );

  // Diagnostic logging (dev only)
  logFilteringSummary(assetsWithValues, significantAssets);

  // Step 8: Calculate allocations
  const totalValue = significantAssets.reduce((sum, asset) => sum + asset.valueUSDT, 0);
  const assetsWithAllocation = significantAssets.map(asset => ({
    ...asset,
    allocation: totalValue > 0 ? (asset.valueUSDT / totalValue) * 100 : 0,
  }));

  // Step 9: Sort by value descending
  const sortedAssets = assetsWithAllocation.sort((a, b) => b.valueUSDT - a.valueUSDT);

  return {
    totalValueUSDT: totalValue,
    assets: sortedAssets,
    lastUpdated: new Date(),
  };
}

/**
 * Build optimized symbol list for batch ticker request
 */
function buildSymbolList(balances: BalanceData[]): Set<string> {
  const symbols = new Set<string>();

  balances.forEach(balance => {
    const asset = balance.asset;

    // Always try USDT pair first
    symbols.add(`${asset}USDT`);

    // For major coins, include conversion pairs
    if (MAJOR_COINS.includes(asset)) {
      if (asset !== 'BTC') {
        symbols.add(`${asset}BTC`);
      }
      if (asset !== 'ETH') {
        symbols.add(`${asset}ETH`);
      }
      if (asset !== 'BNB') {
        symbols.add(`${asset}BNB`);
      }
    }
  });

  // Add conversion rate symbols if cache is stale (>60s)
  const shouldFetchConversionRates =
    Date.now() - conversionRatesCache.lastUpdated > 60000;

  if (shouldFetchConversionRates) {
    symbols.add('BTCUSDT');
    symbols.add('ETHUSDT');
    symbols.add('BNBUSDT');
  }

  return symbols;
}

/**
 * Fetch batch tickers from API
 */
async function fetchBatchTickers(
  symbols: Set<string>,
  signal?: AbortSignal
): Promise<Map<string, TickerData>> {
  const tickerMap = new Map<string, TickerData>();

  if (symbols.size === 0) {
    return tickerMap;
  }

  try {
    const encodedSymbols = encodeURIComponent(JSON.stringify([...symbols]));
    const response = await fetch(
      `/api/binance/ticker/batch?symbols=${encodedSymbols}`,
      { signal }
    );
    const data = await response.json();

    if (data.success && data.data) {
      data.data.forEach((ticker: { symbol: string; lastPrice: string; priceChangePercent: string }) => {
        tickerMap.set(ticker.symbol, {
          price: parseFloat(ticker.lastPrice),
          change: ticker.priceChangePercent || '0',
        });
      });

      // Update conversion rates cache
      if (tickerMap.has('BTCUSDT')) {
        conversionRatesCache.BTCUSDT = tickerMap.get('BTCUSDT')!.price;
        conversionRatesCache.ETHUSDT = tickerMap.get('ETHUSDT')?.price || 0;
        conversionRatesCache.BNBUSDT = tickerMap.get('BNBUSDT')?.price || 0;
        conversionRatesCache.lastUpdated = Date.now();
      }
    }
  } catch (error) {
    // Silent handling for AbortError
    if (error instanceof Error && error.name === 'AbortError') {
      throw error; // Re-throw to propagate
    }
    console.error('[Portfolio] Batch ticker fetch failed:', error);
  }

  return tickerMap;
}

/**
 * Calculate asset value using ticker map with fallback chain
 */
async function calculateAssetValue(
  balance: BalanceData,
  tickerMap: Map<string, TickerData>,
  signal?: AbortSignal
): Promise<PortfolioAsset> {
  let valueUSDT = 0;
  let priceChangePercent = '0';

  // Handle stablecoins
  if (isStablecoin(balance.asset)) {
    valueUSDT = balance.total;
    priceChangePercent = '0';
  } else {
    // Try USDT pair first
    const usdtPair = tickerMap.get(`${balance.asset}USDT`);
    if (usdtPair) {
      valueUSDT = balance.total * usdtPair.price;
      priceChangePercent = usdtPair.change;
    } else {
      // Try BTC conversion
      const btcPair = tickerMap.get(`${balance.asset}BTC`);
      const btcUsdt = tickerMap.get('BTCUSDT') || { price: conversionRatesCache.BTCUSDT };
      if (btcPair && btcUsdt.price > 0) {
        valueUSDT = balance.total * btcPair.price * btcUsdt.price;
        priceChangePercent = btcPair.change;
      } else {
        // Try ETH conversion
        const ethPair = tickerMap.get(`${balance.asset}ETH`);
        const ethUsdt = tickerMap.get('ETHUSDT') || { price: conversionRatesCache.ETHUSDT };
        if (ethPair && ethUsdt.price > 0) {
          valueUSDT = balance.total * ethPair.price * ethUsdt.price;
          priceChangePercent = ethPair.change;
        } else {
          // Try BNB conversion
          const bnbPair = tickerMap.get(`${balance.asset}BNB`);
          const bnbUsdt = tickerMap.get('BNBUSDT') || { price: conversionRatesCache.BNBUSDT };
          if (bnbPair && bnbUsdt.price > 0) {
            valueUSDT = balance.total * bnbPair.price * bnbUsdt.price;
            priceChangePercent = bnbPair.change;
          }
        }
      }
    }
  }

  return {
    asset: balance.asset,
    free: balance.free,
    locked: balance.locked,
    total: balance.total,
    valueUSDT,
    priceChangePercent,
    allocation: 0, // Will be calculated later
  };
}

/**
 * Retry failed assets individually (fallback for missing batch data)
 */
async function retryFailedAssets(
  assets: PortfolioAsset[],
  tickerMap: Map<string, TickerData>,
  signal?: AbortSignal
): Promise<void> {
  const assetsMissingPrice = assets.filter(
    asset =>
      asset.valueUSDT === 0 &&
      !isStablecoin(asset.asset) &&
      tickerMap.size > 0 // Only retry if batch succeeded
  );

  // Only retry reasonable number to avoid API abuse
  if (assetsMissingPrice.length === 0 || assetsMissingPrice.length > MAX_INDIVIDUAL_RETRY_ASSETS) {
    return;
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(
      `[Portfolio] Retrying ${assetsMissingPrice.length} assets with individual requests:`,
      assetsMissingPrice.map(a => a.asset).join(', ')
    );
  }

  // Retry each asset individually
  await Promise.all(
    assetsMissingPrice.map(async asset => {
      try {
        const result = await getAssetValueFallback(asset.asset, asset.total, signal);
        asset.valueUSDT = result.valueUSDT;
        asset.priceChangePercent = result.priceChangePercent;
      } catch (error) {
        // Ignore errors from individual retries
        if (error instanceof Error && error.name !== 'AbortError') {
          console.warn(`[Portfolio] ${asset.asset}: Fallback failed`);
        }
      }
    })
  );
}

/**
 * Fallback function to fetch individual asset price
 */
async function getAssetValueFallback(
  asset: string,
  balance: number,
  signal?: AbortSignal
): Promise<{ valueUSDT: number; priceChangePercent: string }> {
  // Try USDT pair
  try {
    const response = await fetch(`/api/binance/ticker?symbol=${asset}USDT`, { signal });
    const data = await response.json();
    if (data.success && data.data) {
      const price = parseFloat(data.data.price || data.data.lastPrice);
      return {
        valueUSDT: balance * price,
        priceChangePercent: data.data.priceChangePercent || '0',
      };
    }
  } catch {
    // Continue to next fallback
  }

  // Try BTC conversion
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
          priceChangePercent: btcPairData.data.priceChangePercent || '0',
        };
      }
    }
  } catch {
    // Continue to next fallback
  }

  // All fallbacks failed
  return { valueUSDT: 0, priceChangePercent: '0' };
}

/**
 * Log filtering summary (development only)
 */
function logFilteringSummary(
  allAssets: PortfolioAsset[],
  significantAssets: PortfolioAsset[]
): void {
  // Only log in development mode
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  const excludedDust = allAssets.filter(
    a => a.valueUSDT > 0 && a.valueUSDT < DUST_THRESHOLD_USDT
  );
  const excludedNoPrice = allAssets.filter(
    a => a.valueUSDT === 0 && !isStablecoin(a.asset)
  );

  console.log('[Portfolio] Asset filtering summary:', {
    totalAssets: allAssets.length,
    displayed: significantAssets.length,
    filteredTotal: allAssets.length - significantAssets.length,
    excludedDust: excludedDust.length,
    excludedNoPriceCount: excludedNoPrice.length,
    excludedNoPriceAssets: excludedNoPrice.map(a => a.asset).join(', ') || 'none',
  });
}

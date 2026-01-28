/**
 * Shared ticker cache with TTL
 * Used by both single ticker and batch ticker endpoints
 *
 * This module provides a centralized caching mechanism for Binance ticker data
 * to reduce API calls and improve response times. The cache includes automatic
 * expiration and size management.
 */

interface CachedTickerData {
  symbol: string;
  lastPrice: string;
  network: string;
  [key: string]: unknown;
}

interface CacheEntry {
  data: CachedTickerData;
  timestamp: number;
}

const tickerCache = new Map<string, CacheEntry>();
export const CACHE_TTL_MS = 30000; // 30 seconds
const MAX_CACHE_SIZE = 500;

/**
 * Get cached ticker data if not expired
 * @param symbol - Trading pair symbol (e.g., BTCUSDT)
 * @param network - Network type (mainnet or testnet)
 * @returns Cached ticker data or null if expired/not found
 */
export function getCachedTicker(symbol: string, network: string): CachedTickerData | null {
  const cacheKey = `${symbol}_${network}`;
  const cached = tickerCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }
  if (cached) {
    tickerCache.delete(cacheKey); // Remove expired entry
  }
  return null;
}

/**
 * Store ticker data in cache with automatic cleanup
 * @param symbol - Trading pair symbol (e.g., BTCUSDT)
 * @param network - Network type (mainnet or testnet)
 * @param data - Ticker data to cache
 */
export function setCachedTicker(symbol: string, network: string, data: CachedTickerData): void {
  const cacheKey = `${symbol}_${network}`;
  tickerCache.set(cacheKey, { data, timestamp: Date.now() });

  // Cleanup if cache gets too large
  if (tickerCache.size > MAX_CACHE_SIZE) {
    const now = Date.now();
    // First pass: remove expired entries
    for (const [key, value] of tickerCache.entries()) {
      if (now - value.timestamp > CACHE_TTL_MS) {
        tickerCache.delete(key);
      }
    }
    // Second pass: if still too large, remove oldest entries
    if (tickerCache.size > MAX_CACHE_SIZE) {
      const entries = Array.from(tickerCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      entries.slice(0, 100).forEach(([key]) => tickerCache.delete(key));
    }
  }
}

/**
 * Clear all cached ticker data
 * Useful for testing or forced cache invalidation
 */
export function clearTickerCache(): void {
  tickerCache.clear();
}

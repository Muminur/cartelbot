/**
 * Portfolio Data Fetching Hook
 *
 * Centralized data fetching logic with:
 * - Smart caching (5-second stale time)
 * - Page Visibility API integration (no refreshes on hidden tabs)
 * - Proper AbortController per-request pattern
 * - Silent AbortError handling (no console spam)
 * - Request deduplication
 *
 * @example
 * const { data, loading, error, refetch } = usePortfolioData({
 *   autoRefresh: true,
 *   refreshInterval: 30000
 * });
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface PortfolioAsset {
  asset: string;
  free: string;
  locked: string;
  total: number;
  valueUSDT: number;
  priceChangePercent: string;
  allocation: number;
}

export interface PortfolioData {
  totalValueUSDT: number;
  assets: PortfolioAsset[];
  lastUpdated: Date;
}

interface UsePortfolioDataOptions {
  autoRefresh?: boolean;
  refreshInterval?: number;
}

interface PortfolioError {
  message: string;
  code?: string;
  requiresSetup?: boolean;
}

interface CacheEntry {
  data: PortfolioData | null;
  timestamp: number;
}

const CACHE_STALE_TIME = 5000; // 5 seconds

export function usePortfolioData(options: UsePortfolioDataOptions = {}) {
  const { autoRefresh = true, refreshInterval = 30000 } = options;

  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<PortfolioError | null>(null);

  // Refs for abort controller and cache
  const abortControllerRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<CacheEntry>({ data: null, timestamp: 0 });
  const isMountedRef = useRef(true);

  /**
   * Fetch portfolio data with proper abort handling
   * @param force - Force fetch even if cache is fresh
   */
  const fetchData = useCallback(async (force = false): Promise<PortfolioData | null> => {
    // Check cache (skip if force=true)
    if (!force && cacheRef.current.data) {
      const age = Date.now() - cacheRef.current.timestamp;
      if (age < CACHE_STALE_TIME) {
        // Cache hit - return cached data
        if (isMountedRef.current) {
          setData(cacheRef.current.data);
          setLoading(false);
        }
        return cacheRef.current.data;
      }
    }

    // Cancel previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for THIS request
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      if (isMountedRef.current) {
        setRefreshing(true);
        setError(null);
      }

      // Import dynamically to avoid circular dependencies
      const { fetchPortfolioData } = await import('@/lib/portfolio/fetcher');

      const result = await fetchPortfolioData(controller.signal);

      // Update cache and state (only if component is still mounted)
      if (isMountedRef.current) {
        cacheRef.current = {
          data: result,
          timestamp: Date.now(),
        };
        setData(result);
        setError(null);
      }

      return result;
    } catch (err) {
      // Silent handling for AbortError (prevents console spam)
      if (err instanceof Error && err.name === 'AbortError') {
        return null;
      }

      // Handle all other errors
      console.error('[usePortfolioData] Fetch error:', err);

      if (isMountedRef.current) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch portfolio data';
        setError({
          message: errorMessage,
          code: 'FETCH_ERROR',
        });
      }

      return null;
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  // Initial fetch and auto-refresh setup
  useEffect(() => {
    isMountedRef.current = true;

    // Initial fetch
    fetchData();

    if (!autoRefresh) {
      return;
    }

    // Page Visibility API: Don't refresh hidden tabs (saves API calls)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isMountedRef.current) {
        // Force refresh when tab becomes visible
        fetchData(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Auto-refresh interval (only if tab is visible)
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && isMountedRef.current) {
        fetchData();
      }
    }, refreshInterval);

    // Cleanup
    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      // Cancel in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchData, autoRefresh, refreshInterval]);

  return {
    data,
    loading,
    refreshing,
    error,
    refetch: useCallback(() => fetchData(true), [fetchData]),
  };
}

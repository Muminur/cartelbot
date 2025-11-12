"use client";

import { useState, useEffect, useCallback } from "react";

interface UseLivePricesOptions {
  symbols: string[];
  enabled?: boolean;
  refreshInterval?: number; // in milliseconds, default 5000 (5 seconds)
}

export function useLivePrices({ symbols, enabled = true, refreshInterval = 5000 }: UseLivePricesOptions) {
  const [prices, setPrices] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPrices = useCallback(async () => {
    if (!enabled || symbols.length === 0) {
      setLoading(false);
      return;
    }

    try {
      // Make parallel requests for each symbol (avoids 400 error with comma-separated symbols)
      const pricePromises = symbols.map(async (symbol) => {
        try {
          const response = await fetch(`/api/binance/ticker?symbol=${symbol}`);

          if (!response.ok) {
            console.warn(`Failed to fetch price for ${symbol}: ${response.statusText}`);
            return null;
          }

          const data = await response.json();

          if (!data.success) {
            console.warn(`Error fetching ${symbol}:`, data.error?.message);
            return null;
          }

          return {
            symbol: data.data.symbol,
            price: parseFloat(data.data.lastPrice),
          };
        } catch (error) {
          console.warn(`Exception fetching ${symbol}:`, error);
          return null;
        }
      });

      // Wait for all requests to complete
      const results = await Promise.all(pricePromises);

      // Filter out failed requests and update prices map
      const newPrices = new Map<string, number>();

      results.forEach((result) => {
        if (result && result.symbol && result.price) {
          newPrices.set(result.symbol, result.price);
        }
      });

      setPrices(newPrices);
      setError(null);
      setLoading(false);
    } catch (err) {
      console.error("Error fetching live prices:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  }, [symbols, enabled]);

  // Initial fetch
  useEffect(() => {
    fetchPrices();
  }, [fetchPrices]);

  // Set up polling interval
  useEffect(() => {
    if (!enabled || symbols.length === 0) {
      return;
    }

    const intervalId = setInterval(fetchPrices, refreshInterval);

    return () => {
      clearInterval(intervalId);
    };
  }, [fetchPrices, enabled, refreshInterval, symbols.length]);

  // Helper function to get price for a specific symbol
  const getPrice = useCallback((symbol: string): number | undefined => {
    return prices.get(symbol);
  }, [prices]);

  // Helper function to calculate unrealized P&L
  const calculateUnrealizedPnL = useCallback(
    (symbol: string, entryPrice: number, quantity: number): { pnl: number; pnlPercentage: number } | null => {
      const currentPrice = prices.get(symbol);

      if (!currentPrice) {
        return null;
      }

      const pnl = (currentPrice - entryPrice) * quantity;
      const pnlPercentage = ((currentPrice - entryPrice) / entryPrice) * 100;

      return { pnl, pnlPercentage };
    },
    [prices]
  );

  return {
    prices,
    loading,
    error,
    getPrice,
    calculateUnrealizedPnL,
    refresh: fetchPrices,
  };
}

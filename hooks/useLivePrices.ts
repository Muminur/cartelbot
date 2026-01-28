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
      // Use batch endpoint instead of individual calls (fixes N+1)
      const response = await fetch(
        `/api/binance/ticker/batch?symbols=${encodeURIComponent(JSON.stringify(symbols))}`
      );

      if (!response.ok) {
        console.warn(`Failed to fetch batch prices: ${response.statusText}`);
        setError(`Failed to fetch prices: ${response.statusText}`);
        setLoading(false);
        return;
      }

      const data = await response.json();

      if (!data.success) {
        console.warn("Error fetching batch prices:", data.error?.message);
        setError(data.error?.message || "Failed to fetch prices");
        setLoading(false);
        return;
      }

      // Build prices map from batch response
      const newPrices = new Map<string, number>();

      for (const ticker of data.data) {
        if (ticker.symbol && ticker.lastPrice) {
          newPrices.set(ticker.symbol, parseFloat(ticker.lastPrice));
        }
      }

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

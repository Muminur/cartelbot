"use client";

import { useState, useEffect, useCallback } from "react";

interface PriceData {
  symbol: string;
  price: number;
}

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
      // Build query string with all symbols
      const symbolsParam = symbols.join(",");
      const response = await fetch(`/api/binance/ticker?symbols=${symbolsParam}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch prices: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error?.message || "Failed to fetch prices");
      }

      // Update prices map
      const newPrices = new Map<string, number>();

      // Handle both single ticker and array of tickers
      const tickers = Array.isArray(data.data) ? data.data : [data.data];

      tickers.forEach((ticker: PriceData) => {
        if (ticker.symbol && ticker.price) {
          newPrices.set(ticker.symbol, ticker.price);
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

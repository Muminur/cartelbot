/**
 * Stablecoin Utilities
 * Client-safe utilities for identifying stablecoins
 */

/**
 * List of stablecoins that should be valued at $1 USD
 * without needing to fetch ticker data
 */
export const STABLECOINS = ["USDT", "BUSD", "USDC", "DAI", "TUSD"];

/**
 * Checks if an asset is a stablecoin
 * @param asset - Asset symbol (e.g., "USDT", "BTC")
 * @returns True if asset is a stablecoin
 */
export function isStablecoin(asset: string): boolean {
  return STABLECOINS.includes(asset.toUpperCase());
}

/**
 * Binance Helper Functions
 * Utility functions for consistent Binance API interactions
 */

/**
 * Resolves testnet preference with fallback chain:
 * 1. Explicit parameter (from query string or body)
 * 2. User's stored preference (from database)
 * 3. Mainnet default (false)
 *
 * @param apiKeys - Object containing user's API key configuration
 * @param explicitParam - Explicit testnet parameter (from query string or body)
 * @returns Boolean indicating whether to use testnet
 *
 * @example
 * // With explicit parameter
 * const useTestnet = resolveTestnetPreference(apiKeys, "true"); // returns true
 *
 * // With user preference
 * const apiKeys = { useTestnet: true };
 * const useTestnet = resolveTestnetPreference(apiKeys); // returns true
 *
 * // Default to mainnet
 * const apiKeys = { useTestnet: undefined };
 * const useTestnet = resolveTestnetPreference(apiKeys); // returns false
 */
export function resolveTestnetPreference(
  apiKeys: { useTestnet?: boolean },
  explicitParam?: string | null | boolean
): boolean {
  // Handle explicit parameter (query string "true"/"false" or boolean)
  if (explicitParam !== null && explicitParam !== undefined) {
    return typeof explicitParam === "boolean"
      ? explicitParam
      : explicitParam === "true";
  }

  // Fallback to user preference or mainnet default
  return apiKeys.useTestnet ?? false;
}

/**
 * Re-export stablecoin utilities from client-safe location
 * This avoids bundling env.ts into client-side code
 */
export { STABLECOINS, isStablecoin } from "@/lib/utils/stablecoins";

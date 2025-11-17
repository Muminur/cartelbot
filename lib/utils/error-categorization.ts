import { BinanceAPIError, ValidationError } from "./errors";

/**
 * Error categories for trade failures
 */
export type FailureReason =
  | 'INSUFFICIENT_BALANCE'
  | 'INVALID_TARGETS'
  | 'SETTLEMENT_TIMEOUT'
  | 'PHANTOM_ORDERS'
  | 'BINANCE_API_ERROR'
  | 'NETWORK_ERROR'
  | 'INVALID_SYMBOL'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'FILTER_VIOLATION'
  | 'UNKNOWN';

/**
 * Categorize error into a specific failure reason
 * Used for storing structured error data in Signal model
 */
export function categorizeError(error: unknown): FailureReason {
  if (error instanceof BinanceAPIError) {
    switch (error.binanceCode) {
      case -2010:
        return 'INSUFFICIENT_BALANCE';
      case -1013:
        return 'FILTER_VIOLATION';
      case -1021:
        return 'NETWORK_ERROR';
      case -2015:
        return 'PERMISSION_DENIED';
      case 429:
        return 'RATE_LIMITED';
      case -1121:
        return 'INVALID_SYMBOL';
      default:
        return 'BINANCE_API_ERROR';
    }
  }

  if (error instanceof ValidationError) {
    if (error.message.toLowerCase().includes('target')) {
      return 'INVALID_TARGETS';
    }
    if (error.message.toLowerCase().includes('symbol')) {
      return 'INVALID_SYMBOL';
    }
    if (error.message.toLowerCase().includes('filter')) {
      return 'FILTER_VIOLATION';
    }
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('timeout') || message.includes('settlement')) {
      return 'SETTLEMENT_TIMEOUT';
    }
    if (message.includes('phantom')) {
      return 'PHANTOM_ORDERS';
    }
    if (message.includes('balance') || message.includes('insufficient')) {
      return 'INSUFFICIENT_BALANCE';
    }
    if (message.includes('network') || message.includes('connection')) {
      return 'NETWORK_ERROR';
    }
  }

  return 'UNKNOWN';
}

/**
 * Get user-friendly remediation steps for each error category
 * Displayed in ErrorDetailCard component
 */
export function getErrorRemediationSteps(failureReason: FailureReason): string[] {
  const steps: Record<FailureReason, string[]> = {
    INSUFFICIENT_BALANCE: [
      'Wait for previous trades to settle (1-2 minutes)',
      'Check your available USDT balance on Binance',
      'Fund your account if balance is too low',
      'Reduce your default trade amount in settings',
    ],
    INVALID_TARGETS: [
      'Market price moved above target prices',
      'Wait for market to stabilize',
      'Submit a new signal with higher targets',
      'Consider using percentage-based targets instead',
    ],
    SETTLEMENT_TIMEOUT: [
      'Balance settlement took longer than expected',
      'Click retry to attempt OCO creation again',
      'If using testnet, switch to mainnet for better reliability',
    ],
    PHANTOM_ORDERS: [
      'Previous failed attempts left open orders',
      'Log into Binance and cancel all open SELL orders for this symbol',
      'Then retry signal execution',
    ],
    BINANCE_API_ERROR: [
      'Temporary Binance API issue',
      'Wait 1-2 minutes and retry',
      'Check Binance status: https://www.binance.com/en/support/announcement',
    ],
    NETWORK_ERROR: [
      'Network connectivity issue',
      'Check your internet connection',
      'Verify Binance API is accessible',
      'Try again in a few moments',
    ],
    INVALID_SYMBOL: [
      'Trading symbol not found or not available',
      'Verify symbol format ends with USDT (e.g., BTCUSDT)',
      'Check if symbol is available on Binance',
    ],
    PERMISSION_DENIED: [
      'API keys lack required permissions',
      'Log into Binance and verify API key has "Enable Spot & Margin Trading" enabled',
      'Recreate API keys if necessary',
      'Update keys in settings page',
    ],
    RATE_LIMITED: [
      'Too many requests to Binance API',
      'Wait 1-2 minutes before retrying',
      'Reduce trading frequency',
    ],
    FILTER_VIOLATION: [
      'Order parameters violate Binance trading rules',
      'Price precision or quantity may be incorrect',
      'Contact support with this error code',
    ],
    UNKNOWN: [
      'Unknown error occurred',
      'Check error message for details',
      'Contact support if problem persists',
    ],
  };

  return steps[failureReason] || steps.UNKNOWN;
}

/**
 * Format error code from error object
 * Returns standardized error code string
 */
export function formatErrorCode(error: unknown): string {
  if (error instanceof BinanceAPIError && error.binanceCode) {
    return `BINANCE_${error.binanceCode}`;
  }

  if (error instanceof ValidationError) {
    return 'VALIDATION_ERROR';
  }

  if (error instanceof Error && error.name) {
    return error.name.toUpperCase().replace(/ /g, '_');
  }

  return 'UNKNOWN_ERROR';
}

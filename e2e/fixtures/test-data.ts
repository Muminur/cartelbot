/**
 * E2E Test Data Fixtures
 * Provides test data for CartelBot E2E tests
 *
 * SECURITY NOTES:
 * - Validates production API keys to prevent real trades
 * - Uses unique emails to prevent test pollution
 * - Requires environment variables for sensitive data
 */

import { randomUUID } from 'crypto';

/**
 * Validate that API keys are testnet keys, not production
 * CRITICAL: Prevents executing real trades during E2E tests
 */
function validateTestnetApiKey(apiKey: string | undefined, fieldName: string): string {
  if (!apiKey) {
    return 'test_api_key'; // Safe default for missing keys
  }

  // Production Binance API keys are typically 64 characters
  // If we detect a production-like key, throw error
  if (apiKey.length === 64 && !apiKey.startsWith('test_')) {
    throw new Error(
      `CRITICAL: Production API key detected in ${fieldName}!\n` +
      `E2E tests must use testnet API keys only.\n` +
      `Set ${fieldName} to your Binance Testnet API key.`
    );
  }

  return apiKey;
}

/**
 * Generate unique test user data
 * Prevents test collisions in parallel execution
 * FIXED: Validates API keys to prevent production key usage
 */
export function generateTestUser(type: 'regular' | 'premium' = 'regular') {
  const uniqueId = randomUUID().slice(0, 8);

  // Validate API keys before returning
  const apiKey = validateTestnetApiKey(process.env.TEST_BINANCE_API_KEY, 'TEST_BINANCE_API_KEY');
  const apiSecret = validateTestnetApiKey(process.env.TEST_BINANCE_API_SECRET, 'TEST_BINANCE_API_SECRET');

  return {
    email: `test-${uniqueId}@e2e.test`,
    apiKey,
    apiSecret,
    useTestnet: true,
    subscription: type === 'premium' ? 'premium' : 'free',
  };
}

/**
 * Static test users for backwards compatibility
 * WARNING: Use generateTestUser() for new tests to avoid collisions
 */
export const TEST_USERS = {
  regular: generateTestUser('regular'),
  premium: generateTestUser('premium'),
  // Admin credentials are lazily loaded only when needed
  get admin() {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.TEST_ADMIN_PASSWORD;
    if (!password) {
      throw new Error(
        'TEST_ADMIN_PASSWORD environment variable is required for admin E2E tests.\n' +
        'This prevents hardcoded passwords in source code.\n' +
        'Example: export TEST_ADMIN_PASSWORD=aDmin@7878'
      );
    }
    return { username, password };
  },
};

export const TEST_SIGNALS = {
  percentageBased: `Buying $BTC
First buying: 50000 – 51000
Targets: 4%, 8%, 12%, 20%
Sl: 48000`,

  priceBased: `$ETH Buying Now:
Entry: 3000 - 2900
Targets: 3100, 3200, 3400, 3600
SL: 2800`,

  mixedFormat: `Buying $BNB
First buying: 600 – 610
Second buying: 590
CMP: 605
Targets: 620, 640, 660, 680, 700
Sl: 580`,

  invalid: 'This is not a valid trading signal',
};

export const TEST_TRADE_CONFIG = {
  fixed: {
    method: 'fixed',
    amount: 100, // $100 USDT
  },
  percentage: {
    method: 'percentage',
    percentage: 5, // 5% of balance
  },
  riskBased: {
    method: 'risk_based',
    riskPercent: 2, // 2% risk per trade
  },
};

export const API_ROUTES = {
  AUTH: {
    MAGIC_LINK: '/api/auth/magic-link',
    VERIFY: '/api/auth/verify',
    SESSION: '/api/auth/session',
    LOGOUT: '/api/auth/logout',
  },
  SIGNALS: {
    PARSE: '/api/signals/parse',
    LIST: '/api/signals',
    SUBMIT: '/api/signals',
    DETAIL: (id: string) => `/api/signals/${id}`,
  },
  TRADES: {
    EXECUTE: '/api/trades/execute',
    LIST: '/api/trades',
    DETAIL: (id: string) => `/api/trades/${id}`,
    APPROVE: '/api/trades/approve',
    CLOSE: (id: string) => `/api/trades/close/${id}`,
  },
  ADMIN: {
    LOGIN: '/api/admin/auth/login',
    STATS: '/api/admin/stats',
    USERS: '/api/admin/users',
    SUBSCRIPTIONS: '/api/admin/subscriptions',
    SIGNALS: '/api/admin/signals',
  },
  WEBSOCKET: {
    START: '/api/websocket/start',
    STOP: '/api/websocket/stop',
    STATUS: '/api/websocket/status',
    STREAM: '/api/websocket/stream',
  },
};

export const PAGE_ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  VERIFY: '/verify',
  DASHBOARD: '/dashboard',
  SIGNALS: '/signals',
  SIGNALS_HISTORY: '/signals/history',
  TRADES: '/trades',
  TRADES_EXECUTE: '/trades/execute',
  PORTFOLIO: '/portfolio',
  SETTINGS: '/settings',
  ADMIN_LOGIN: '/admin/login',
  ADMIN_DASHBOARD: '/admin',
  ADMIN_USERS: '/admin/users',
  ADMIN_SUBSCRIPTIONS: '/admin/subscriptions',
  ADMIN_SIGNALS: '/admin/signals',
  ADMIN_SYSTEM: '/admin/system',
};

export const TIMEOUTS = {
  SHORT: 5000,       // 5 seconds
  MEDIUM: 10000,     // 10 seconds
  LONG: 30000,       // 30 seconds
  WEBSOCKET: 15000,  // 15 seconds for WebSocket connection
  TRADE: 45000,      // 45 seconds for trade execution
};

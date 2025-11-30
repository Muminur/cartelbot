/**
 * E2E Test Data Fixtures
 * Provides test data for CartelBot E2E tests
 */

export const TEST_USERS = {
  regular: {
    email: 'test@example.com',
    apiKey: process.env.TEST_BINANCE_API_KEY || 'test_api_key',
    apiSecret: process.env.TEST_BINANCE_API_SECRET || 'test_api_secret',
    useTestnet: true,
  },
  premium: {
    email: 'premium@example.com',
    apiKey: process.env.TEST_BINANCE_API_KEY || 'test_api_key',
    apiSecret: process.env.TEST_BINANCE_API_SECRET || 'test_api_secret',
    useTestnet: true,
    subscription: 'premium',
  },
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.TEST_ADMIN_PASSWORD || 'aDmin@7878',
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

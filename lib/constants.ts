export const SUBSCRIPTION_TIERS = {
  FREE: {
    name: "Free",
    price: 0,
    signalsPerMonth: 1,
    features: ["1 signal per month", "Basic support", "Binance Spot trading"],
  },
  PREMIUM: {
    name: "Premium",
    price: 3,
    signalsPerMonth: 50,
    features: [
      "50 signals per month",
      "Priority support",
      "Binance Spot trading",
      "Advanced analytics",
    ],
  },
  PRO: {
    name: "Pro",
    price: 10,
    signalsPerMonth: -1,
    features: [
      "Unlimited signals",
      "24/7 Premium support",
      "Binance Spot trading",
      "Advanced analytics",
      "Custom target distribution",
      "API access",
    ],
  },
} as const;

export const BINANCE_LIMITS = {
  MAX_ORDERS_PER_10_SEC: 50,
  MAX_WEIGHT_PER_MINUTE: 6000,
  DEFAULT_RECV_WINDOW: 5000,
  WEBSOCKET_KEEPALIVE_INTERVAL: 30 * 60 * 1000,
} as const;

export const TRADE_DEFAULTS = {
  INVESTMENT_AMOUNT: 100,
  TARGET_DISTRIBUTION: [75, 15, 10],
  MIN_INVESTMENT: 10,
  MAX_INVESTMENT: 100000,
  MAX_TARGETS: 5,
} as const;

export const TRADE_EXECUTION = {
  TESTNET_SETTLEMENT_DELAY_MS: 3000, // 3 seconds for testnet balance settlement
  MAINNET_SETTLEMENT_DELAY_MS: 2000, // 2 seconds for mainnet balance settlement (Binance matching engine delay)
  OCO_RETRY_MAX_ATTEMPTS: 3,
  OCO_RETRY_BASE_DELAY_MS: 2000,
  OCO_RETRY_MAX_TOTAL_DURATION_MS: 20000, // 20 seconds max total wait (3s initial + 2s + 4s + 8s retries)
  BALANCE_TOLERANCE: 0.00000001, // 1e-8 for Binance precision (floating point tolerance)
} as const;

export const SIGNAL_STATUS = {
  PENDING: "pending",
  PARSED: "parsed",
  EXECUTING: "executing",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

export const TRADE_STATUS = {
  OPEN: "open",
  PARTIAL: "partial",
  CLOSED: "closed",
  CANCELLED: "cancelled",
} as const;

export const ORDER_SIDE = {
  BUY: "BUY",
  SELL: "SELL",
} as const;

export const ORDER_TYPE = {
  MARKET: "MARKET",
  LIMIT: "LIMIT",
  OCO: "OCO",
} as const;

export const PAGINATION_DEFAULTS = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

export const REGEX_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  SYMBOL: /^[A-Z]{3,10}USDT$/,
  TRON_ADDRESS: /^T[a-zA-Z0-9]{33}$/,
  TX_HASH: /^(0x)?[0-9a-fA-F]{64}$/,
} as const;

export const API_ROUTES = {
  AUTH: {
    MAGIC_LINK: "/api/auth/magic-link",
    VERIFY: "/api/auth/verify",
    LOGOUT: "/api/auth/logout",
    SESSION: "/api/auth/session",
  },
  SIGNALS: {
    CREATE: "/api/signals/create",
    LIST: "/api/signals",
    GET: (id: string) => `/api/signals/${id}`,
    DELETE: (id: string) => `/api/signals/${id}`,
  },
  TRADES: {
    EXECUTE: "/api/trades/execute",
    LIST: "/api/trades",
    GET: (id: string) => `/api/trades/${id}`,
    CLOSE: (id: string) => `/api/trades/${id}/close`,
  },
  USER: {
    PROFILE: "/api/user/profile",
    API_KEYS: "/api/user/api-keys",
    STATS: "/api/user/stats",
  },
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
} as const;

import { Document } from "mongoose";

export interface IUser extends Document {
  email: string;
  encryptedApiKey?: string;
  encryptedApiSecret?: string;
  subscriptionTier: "free" | "premium" | "pro";
  subscriptionExpiry?: Date;
  isActive: boolean;
  lastLogin?: Date;
  maxPositionSize?: number;
  maxDailyLoss?: number;
  maxOpenPositions?: number;
  requireApproval?: boolean;
  emergencyStop?: boolean;
  investmentAmount?: number;
  maxTargets?: number;
  targetDistribution?: number[];
  positionSizingMethod?: "fixed" | "percentage" | "risk_based";
  riskPercentage?: number;
  emailNotifications?: {
    onTradeExecuted: boolean;
    onTargetHit: boolean;
    onStopLossHit: boolean;
    onTargetAdjustment: boolean;
    dailySummary: boolean;
  };
  emailFrequency?: "instant" | "hourly" | "daily";
  telegramEnabled?: boolean;
  useTestnet?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISignal extends Document {
  userId: string;
  symbol: string;
  entries: number[];
  targets: number[];
  stopLoss: number;
  currentMarketPrice?: number;
  status: "pending" | "parsed" | "executing" | "completed" | "failed" | "cancelled";
  rawSignal: string;
  isImageSignal: boolean;
  imageUrl?: string;
  parseErrors?: string[];
  executionError?: string;
  executionErrorCode?: string;
  executionErrorTimestamp?: Date;
  failureReason?:
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
  createdAt: Date;
  updatedAt: Date;
}

export interface IOrder {
  orderId: number;
  orderListId?: number; // For OCO orders - used to cancel the entire OCO group
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT" | "OCO" | "LIMIT_MAKER" | "STOP_LOSS_LIMIT";
  quantity: number;
  price?: number;
  stopPrice?: number;
  executedQty: number;
  cummulativeQuoteQty: number;
  status: string;
  timestamp: Date;
  fills?: Array<{
    price: string;
    qty: string;
    commission: string;
    commissionAsset: string;
  }>;
}

export interface ITradeError {
  message: string;
  code?: string;
  timestamp: Date;
  operation?: string;
}

// Tracks OCO targets that failed to create
export interface IFailedTarget {
  index: number;           // Target index (0-based)
  price: number;           // Target price that failed
  reason: string;          // Human-readable failure reason
  code?: string;           // Binance error code (e.g., "-2010")
  timestamp: Date;
}

// Summary of OCO creation process
export interface IOCOCreationSummary {
  createdCount: number;         // Successfully created OCO pairs
  failedCount: number;          // Failed OCO targets
  totalTargets: number;         // Original target count
  allocatedQuantity: number;    // Total quantity allocated to OCOs
  unallocatedQuantity: number;  // Remaining unallocated quantity
  allocationPercentage: number; // Percentage of buy qty covered by OCOs
}

export interface ITrade extends Document {
  userId: string;
  signalId: string;
  symbol: string;
  buyOrder: IOrder;
  sellOrders: IOrder[];
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  investedAmount: number;
  realizedPnL?: number;
  unrealizedPnL?: number;
  status: "pending_approval" | "open" | "partial" | "closed" | "cancelled";
  closeReason?: "target" | "stop_loss" | "manual" | "cancelled";
  closeReasonDetail?: string;
  approvalStatus?: "pending" | "approved" | "rejected" | "not_required";
  approvedAt?: Date;
  approvedBy?: string;
  targets?: number[];
  stopLoss?: number;
  targetAdjustmentReason?: string; // Records why targets were adjusted (e.g., market moved above targets)
  targetAdjustmentNotificationSent?: boolean; // Flag to track if user has been notified about target adjustments
  preBuyBalance?: number; // Balance of base asset BEFORE the buy order (for settlement verification)
  testnet?: boolean;
  lastError?: {
    message?: string;
    code?: string;
    timestamp?: Date;
  };
  tradeErrors?: ITradeError[]; // Renamed from 'errors' to avoid conflict with Document.errors
  failedTargets?: IFailedTarget[];      // Tracks OCO targets that failed to create
  ocoCreationSummary?: IOCOCreationSummary; // Summary of OCO creation process
  createdAt: Date;
  updatedAt: Date;
}

export interface ISubscription extends Document {
  userId: string;
  tier: "free" | "premium" | "pro";
  amount: number;
  currency: "USDT";
  txHash?: string;
  fromAddress?: string;
  status: "pending" | "confirmed" | "expired" | "cancelled";
  startDate: Date;
  endDate: Date;
  autoRenew: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWebSocketSession extends Document {
  userId: string;
  listenKey: string;
  isActive: boolean;
  lastKeepAlive: Date;
  connectionState: "connecting" | "connected" | "disconnected" | "error";
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IOrphanedCoin extends Document {
  userId: string;
  signalId: string;
  tradeId: string;
  symbol: string;
  quantity: number;
  buyPrice: number;
  buyOrderId: number;
  buyTimestamp: Date;
  currentMarketPrice?: number;
  status: "active" | "sold" | "expired";
  createdAt: Date;
  updatedAt: Date;
}

export interface ParsedSignal {
  symbol: string;
  entries: number[];
  targets: number[];
  stopLoss: number;
  currentMarketPrice?: number;
  confidence: number;
  errors: string[];
  extractedText?: string;
}

export interface BinanceOrderResponse {
  symbol: string;
  orderId: number;
  orderListId: number;
  clientOrderId: string;
  transactTime: number;
  time: number; // Order creation timestamp (milliseconds) - REQUIRED by Binance API
  updateTime?: number; // Last update timestamp (milliseconds)
  workingTime?: number; // Time when order started working on order book (milliseconds)
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: string;
  timeInForce: string;
  type: string;
  side: string;
  stopPrice?: string;
  icebergQty?: string;
  isWorking?: boolean;
  origQuoteOrderQty?: string; // Original quote order quantity (used for MARKET orders)
  selfTradePreventionMode?: string; // STP mode (NONE, EXPIRE_TAKER, EXPIRE_MAKER, EXPIRE_BOTH)
  fills?: Array<{
    price: string;
    qty: string;
    commission: string;
    commissionAsset: string;
  }>;
}

export interface BinanceOCOOrderReport {
  symbol: string;
  orderId: number;
  orderListId: number;
  clientOrderId: string;
  transactTime: number;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: string;
  timeInForce: string;
  type: string;
  side: string;
  stopPrice?: string;
  workingTime: number;
  selfTradePreventionMode: string;
}

export interface BinanceOCOResponse {
  orderListId: number;
  contingencyType: string;
  listStatusType: string;
  listOrderStatus: string;
  listClientOrderId: string;
  transactionTime: number;
  symbol: string;
  orders: Array<{
    symbol: string;
    orderId: number;
    clientOrderId: string;
  }>;
  orderReports: BinanceOCOOrderReport[];
}

export interface BinanceAccountInfo {
  makerCommission: number;
  takerCommission: number;
  buyerCommission: number;
  sellerCommission: number;
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  balances: Array<{
    asset: string;
    free: string;
    locked: string;
  }>;
}

export interface BinanceSymbolFilter {
  filterType: string;
  minPrice?: string;
  maxPrice?: string;
  tickSize?: string;
  minQty?: string;
  maxQty?: string;
  stepSize?: string;
  minNotional?: string;
  maxNotional?: string;
  // PERCENT_PRICE_BY_SIDE filter fields
  bidMultiplierUp?: string;
  bidMultiplierDown?: string;
  askMultiplierUp?: string;
  askMultiplierDown?: string;
  avgPriceMins?: number;
}

export interface BinanceSymbolInfo {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  filters: BinanceSymbolFilter[];
}

export interface BinanceExchangeInfo {
  timezone: string;
  serverTime: number;
  symbols: BinanceSymbolInfo[];
}

export interface BinanceTicker24hr {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  prevClosePrice: string;
  lastPrice: string;
  lastQty: string;
  bidPrice: string;
  askPrice: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
  firstId: number;
  lastId: number;
  count: number;
  price?: string; // Alias for lastPrice
  network: "testnet" | "mainnet"; // Network indicator - REQUIRED (Fix #1)
}

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    statusCode?: number;
  };
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface TradeStats {
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  totalInvested: number;
  totalRealized: number;
  winRate: number;
}

export interface UserProfile {
  id: string;
  email: string;
  subscriptionTier: "free" | "premium" | "pro";
  subscriptionExpiry?: Date;
  isActive: boolean;
  hasApiKeys: boolean;
  stats?: TradeStats;
  investmentAmount?: number;
  positionSizingMethod?: "fixed" | "percentage" | "risk_based";
  riskPercentage?: number;
  useTestnet?: boolean;
  maxTargets?: number;
  targetDistribution?: number[];
  maxPositionSize?: number;
  maxDailyLoss?: number;
  maxOpenPositions?: number;
  requireApproval?: boolean;
  emergencyStop?: boolean;
}

export interface SignalSubmission {
  rawSignal: string;
  isImageSignal: boolean;
  imageUrl?: string;
}

export interface TradeExecutionRequest {
  signalId: string;
  investmentAmount: number;
  targetDistribution?: number[];
}

/**
 * User object with decrypted API keys selected from database
 * Used when we need to access encrypted fields with select: false
 */
export interface UserWithEncryptedKeys {
  _id: string;
  email: string;
  encryptedApiKey: string;
  encryptedApiSecret: string;
  useTestnet?: boolean;
}

/**
 * Extended signal interface for admin views
 * Includes additional fields not present in the base ISignal interface
 */
export interface AdminSignal {
  _id: string;
  userId: string;
  userEmail?: string;
  symbol: string;
  entries: number[];
  targets: number[];
  stopLoss: number;
  currentMarketPrice?: number;
  status: "pending" | "parsed" | "executing" | "completed" | "failed" | "cancelled";
  rawSignal: string;
  isImageSignal: boolean;
  imageUrl?: string;
  confidence?: number;
  parseErrors?: string[];
  executionError?: string;
  executionErrorCode?: string;
  executionErrorTimestamp?: Date;
  failureReason?:
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
  createdAt: Date;
  updatedAt: Date;
}

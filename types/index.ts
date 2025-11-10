import { Document } from "mongoose";

export interface IUser extends Document {
  email: string;
  encryptedApiKey?: string;
  encryptedApiSecret?: string;
  subscriptionTier: "free" | "premium" | "pro";
  subscriptionExpiry?: Date;
  isActive: boolean;
  lastLogin?: Date;
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
  createdAt: Date;
  updatedAt: Date;
}

export interface IOrder {
  orderId: number;
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT" | "OCO";
  quantity: number;
  price?: number;
  stopPrice?: number;
  executedQty: number;
  cummulativeQuoteQty: number;
  status: string;
  timestamp: Date;
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
  status: "open" | "partial" | "closed" | "cancelled";
  closeReason?: "target" | "stop_loss" | "manual" | "cancelled";
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

export interface ParsedSignal {
  symbol: string;
  entries: number[];
  targets: number[];
  stopLoss: number;
  currentMarketPrice?: number;
  confidence: number;
  errors: string[];
}

export interface BinanceOrderResponse {
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
  fills?: Array<{
    price: string;
    qty: string;
    commission: string;
    commissionAsset: string;
  }>;
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

export interface BinanceSymbolInfo {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  filters: Array<{
    filterType: string;
    minPrice?: string;
    maxPrice?: string;
    tickSize?: string;
    minQty?: string;
    maxQty?: string;
    stepSize?: string;
    minNotional?: string;
  }>;
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

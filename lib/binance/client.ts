import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import crypto from "crypto";
import { Agent as HttpAgent } from "http";
import { Agent as HttpsAgent } from "https";
import { env } from "@/lib/config/env";
import { BinanceAPIError } from "@/lib/utils/errors";
import {
  BinanceAccountInfo,
  BinanceOrderResponse,
  BinanceOCOResponse,
  BinanceExchangeInfo,
  BinanceTicker24hr,
  BinanceSymbolFilter,
} from "@/types";

interface BinanceClientConfig {
  apiKey: string;
  apiSecret: string;
  testnet?: boolean;
}

interface RateLimitInfo {
  weight: number;
  lastReset: number;
}

interface OrderRateLimitInfo {
  orders: { timestamp: number }[];
}

export class BinanceClient {
  private axios: AxiosInstance;
  private apiKey: string;
  private apiSecret: string;
  private baseURL: string;
  private rateLimit: RateLimitInfo = { weight: 0, lastReset: Date.now() };
  private orderRateLimit: OrderRateLimitInfo = { orders: [] };
  private serverTimeOffset: number = 0;
  private readonly MAX_WEIGHT_PER_MINUTE = 6000;
  private readonly MAX_ORDERS_PER_10_SECONDS = 50;
  private readonly RECV_WINDOW = 5000;

  constructor(config: BinanceClientConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.baseURL = config.testnet
      ? env.BINANCE_TESTNET_URL
      : env.BINANCE_API_URL;

    // Create HTTP agents with keep-alive to prevent ECONNRESET errors
    // Keep-alive reuses TCP connections instead of creating new ones each time
    const httpAgent = new HttpAgent({
      keepAlive: true,
      keepAliveMsecs: 30000, // Send keep-alive probe every 30 seconds
      maxSockets: 50, // Maximum concurrent connections per host
      maxFreeSockets: 10, // Maximum idle connections to keep open
    });

    const httpsAgent = new HttpsAgent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 50,
      maxFreeSockets: 10,
    });

    this.axios = axios.create({
      baseURL: this.baseURL,
      timeout: 10000, // 10s timeout (reduced from 30s to prevent connection pool exhaustion)
      headers: {
        "X-MBX-APIKEY": this.apiKey,
        "Content-Type": "application/json",
      },
      httpAgent,
      httpsAgent,
    });

    this.axios.interceptors.response.use(
      (response) => {
        const weight = parseInt(response.headers["x-mbx-used-weight-1m"] || "0");
        if (weight > 0) {
          this.updateRateLimit(weight);
        }
        return response;
      },
      (error) => {
        if (error.response?.data) {
          const { code, msg } = error.response.data;
          throw new BinanceAPIError(
            this.getErrorMessage(code, msg),
            code || error.response.status
          );
        }
        throw error;
      }
    );
  }

  private getErrorMessage(code: number, defaultMsg: string): string {
    switch (code) {
      case -1021:
        return "Timestamp synchronization failed. Please try again.";
      case -2010:
        return "Insufficient balance to execute this order.";
      case -2015:
        return "Invalid API-key, IP, or permissions for action.";
      case -2014:
        return "Invalid API key format.";
      case -1022:
        return "Invalid signature.";
      case 429:
        return "Rate limit exceeded. Please wait before retrying.";
      default:
        return defaultMsg || "Binance API error";
    }
  }

  /**
   * Check if an error is a network error that should be retried
   */
  private isNetworkError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const networkErrorCodes = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ECONNREFUSED',
      'EHOSTUNREACH',
      'ENETUNREACH',
      'EAI_AGAIN'
    ];

    // Check error code
    if ('code' in error && typeof error.code === 'string') {
      if (networkErrorCodes.includes(error.code)) return true;
    }

    // Check error message for network-related keywords
    const errorMessage = error.message?.toLowerCase() || '';
    return networkErrorCodes.some(code =>
      errorMessage.includes(code.toLowerCase())
    );
  }

  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    initialDelay: number = 1000,
    skipRetryOnCodes: number[] = [-2010]
  ): Promise<T> {
    let lastError: Error | BinanceAPIError = new Error("Unknown error");

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: unknown) {
        lastError = error instanceof Error || error instanceof BinanceAPIError
          ? error
          : new Error(String(error));

        // Handle Binance API errors
        if (error instanceof BinanceAPIError && error.binanceCode !== undefined) {
          if (skipRetryOnCodes.includes(error.binanceCode)) {
            throw error;
          }

          if (error.binanceCode === -1021) {
            await this.syncServerTime();
            const delay = initialDelay * Math.pow(2, attempt);
            console.warn(`[Binance] Timestamp sync issue, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }

          if (error.binanceCode === 429) {
            const delay = initialDelay * Math.pow(2, attempt + 1);
            console.warn(`[Binance] Rate limit hit, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        }

        // Handle network errors (ECONNRESET, ETIMEDOUT, etc.)
        if (this.isNetworkError(error)) {
          if (attempt < maxRetries) {
            const delay = initialDelay * Math.pow(2, attempt);
            const errorCode = (error as Error & { code?: string }).code || 'NETWORK_ERROR';
            console.warn(
              `[Binance] Network error (${errorCode}), retrying in ${delay}ms ` +
              `(attempt ${attempt + 1}/${maxRetries + 1})`
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          } else {
            // After all retries exhausted, throw a user-friendly error
            throw new Error(
              `Network connection to Binance failed after ${maxRetries + 1} attempts. ` +
              `Please check your internet connection and try again.`
            );
          }
        }

        // For other errors, retry without specific logging
        if (attempt < maxRetries) {
          const delay = initialDelay * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  private updateRateLimit(weight: number): void {
    const now = Date.now();
    if (now - this.rateLimit.lastReset > 60000) {
      this.rateLimit = { weight, lastReset: now };
    } else {
      this.rateLimit.weight = weight;
    }
  }

  private updateOrderRateLimit(): void {
    const now = Date.now();
    const tenSecondsAgo = now - 10000;

    this.orderRateLimit.orders = this.orderRateLimit.orders.filter(
      (order) => order.timestamp > tenSecondsAgo
    );

    this.orderRateLimit.orders.push({ timestamp: now });
  }

  private async checkOrderRateLimit(): Promise<void> {
    const now = Date.now();
    const tenSecondsAgo = now - 10000;

    const recentOrders = this.orderRateLimit.orders.filter(
      (order) => order.timestamp > tenSecondsAgo
    );

    if (recentOrders.length >= this.MAX_ORDERS_PER_10_SECONDS) {
      const oldestOrder = recentOrders[0];
      const waitTime = 10000 - (now - oldestOrder.timestamp);

      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  async syncServerTime(): Promise<void> {
    try {
      const serverTime = await this.getServerTime();
      const localTime = Date.now();
      this.serverTimeOffset = serverTime - localTime;
    } catch {
      this.serverTimeOffset = 0;
    }
  }

  private createSignature(queryString: string): string {
    return crypto
      .createHmac("sha256", this.apiSecret)
      .update(queryString)
      .digest("hex");
  }

  private async signedRequest<T>(
    method: "GET" | "POST" | "DELETE",
    endpoint: string,
    params: Record<string, string | number | boolean | undefined> = {}
  ): Promise<T> {
    return this.retryWithBackoff(async () => {
      const timestamp = Date.now() + this.serverTimeOffset;
      const queryParams = {
        ...params,
        timestamp,
        recvWindow: this.RECV_WINDOW,
      };

      const queryString = new URLSearchParams(
        Object.entries(queryParams)
          .filter(([, v]) => v !== undefined && v !== null)
          .map(([k, v]) => [k, String(v)])
      ).toString();

      const signature = this.createSignature(queryString);
      const url = `${endpoint}?${queryString}&signature=${signature}`;

      if (this.rateLimit.weight >= this.MAX_WEIGHT_PER_MINUTE * 0.9) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      const config: AxiosRequestConfig = { method, url };
      const response = await this.axios.request<T>(config);
      return response.data;
    });
  }

  async getServerTime(): Promise<number> {
    const response = await this.axios.get<{ serverTime: number }>("/api/v3/time");
    return response.data.serverTime;
  }

  async getExchangeInfo(symbol?: string): Promise<BinanceExchangeInfo> {
    const params = symbol ? { symbol } : {};
    const response = await this.axios.get<BinanceExchangeInfo>(
      "/api/v3/exchangeInfo",
      { params }
    );
    return response.data;
  }

  async getAccount(): Promise<BinanceAccountInfo> {
    return this.signedRequest<BinanceAccountInfo>("GET", "/api/v3/account");
  }

  async get24hrTicker(symbol: string): Promise<BinanceTicker24hr> {
    // Use retry logic with exponential backoff for network errors (ECONNRESET, ETIMEDOUT)
    // This prevents immediate failures on transient connection issues
    return this.retryWithBackoff(
      async () => {
        const response = await this.axios.get<BinanceTicker24hr>(
          "/api/v3/ticker/24hr",
          { params: { symbol } }
        );
        return response.data;
      },
      3, // maxRetries: 3 attempts (total 4 tries)
      1000, // initialDelay: 1s, then 2s, then 4s (exponential backoff)
      [] // Don't skip retry on any error codes for public endpoint
    );
  }

  async getBatch24hrTicker(symbols: string[]): Promise<BinanceTicker24hr[]> {
    // Binance API accepts symbols as JSON array: ["BTCUSDT","ETHUSDT"]
    const encodedSymbols = encodeURIComponent(JSON.stringify(symbols));

    // Use retry logic with exponential backoff for network errors
    return this.retryWithBackoff(
      async () => {
        const response = await this.axios.get<BinanceTicker24hr[]>(
          `/api/v3/ticker/24hr?symbols=${encodedSymbols}`
        );
        return response.data;
      },
      3, // maxRetries: 3 attempts (total 4 tries including first attempt)
      1000, // initialDelay: 1s, then 2s, then 4s
      [] // Don't skip retry on any Binance error codes for public endpoint
    );
  }

  async getAll24hrTickers(): Promise<BinanceTicker24hr[]> {
    // Fetch all tickers (no symbol parameter)
    const response = await this.axios.get<BinanceTicker24hr[]>(
      "/api/v3/ticker/24hr"
    );
    return response.data;
  }

  async createMarketBuyOrder(
    symbol: string,
    quoteOrderQty: number
  ): Promise<BinanceOrderResponse> {
    await this.checkOrderRateLimit();
    const result = await this.signedRequest<BinanceOrderResponse>("POST", "/api/v3/order", {
      symbol,
      side: "BUY",
      type: "MARKET",
      quoteOrderQty: quoteOrderQty.toFixed(2),
    });
    this.updateOrderRateLimit();
    return result;
  }

  async createMarketSellOrder(
    symbol: string,
    quantity: number
  ): Promise<BinanceOrderResponse> {
    await this.checkOrderRateLimit();

    // Get exchange info to validate filters and determine correct precision
    const exchangeInfo = await this.getExchangeInfo(symbol);
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);

    if (!symbolInfo) {
      throw new BinanceAPIError(`Symbol ${symbol} not found`, -1121);
    }

    // Get step size for quantity formatting
    const lotSizeFilter = symbolInfo.filters.find((f) => f.filterType === "LOT_SIZE");
    const stepSize = lotSizeFilter?.stepSize || "0.00000001";

    // Calculate precision for formatting
    const getPrecision = (sizeStr: string): number => {
      const decimalIndex = sizeStr.indexOf(".");
      const oneIndex = sizeStr.indexOf("1");

      if (decimalIndex === -1 || oneIndex < decimalIndex) {
        return 0; // Whole number
      }

      return oneIndex - decimalIndex;
    };

    const quantityPrecision = getPrecision(stepSize);

    // Format quantity with correct precision
    const formattedQuantity = quantity.toFixed(quantityPrecision);

    // eslint-disable-next-line no-console
    console.log("Market Sell Order Parameters:", {
      symbol,
      quantity: formattedQuantity,
      stepSize,
      quantityPrecision,
    });

    const result = await this.signedRequest<BinanceOrderResponse>("POST", "/api/v3/order", {
      symbol,
      side: "SELL",
      type: "MARKET",
      quantity: formattedQuantity,
    });
    this.updateOrderRateLimit();
    return result;
  }

  async createOCOOrder(
    symbol: string,
    quantity: number,
    price: number,
    stopPrice: number,
    stopLimitPrice: number
  ): Promise<BinanceOCOResponse> {
    await this.checkOrderRateLimit();

    // Get exchange info to validate filters
    const exchangeInfo = await this.getExchangeInfo(symbol);
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);

    if (!symbolInfo) {
      throw new BinanceAPIError(`Symbol ${symbol} not found`, -1121);
    }

    // Get tick size for proper formatting
    const priceFilter = symbolInfo.filters.find((f) => f.filterType === "PRICE_FILTER");
    const tickSize = priceFilter?.tickSize || "0.00000001";

    // Get step size for quantity formatting
    const lotSizeFilter = symbolInfo.filters.find((f) => f.filterType === "LOT_SIZE");
    const stepSize = lotSizeFilter?.stepSize || "0.00000001";

    // Calculate precision for formatting
    const getPrecision = (sizeStr: string): number => {
      const decimalIndex = sizeStr.indexOf(".");
      const oneIndex = sizeStr.indexOf("1");

      if (decimalIndex === -1 || oneIndex < decimalIndex) {
        return 0; // Whole number
      }

      return oneIndex - decimalIndex;
    };

    const pricePrecision = getPrecision(tickSize);
    const quantityPrecision = getPrecision(stepSize);

    // Format values with correct precision
    const formattedQuantity = quantity.toFixed(quantityPrecision);
    const formattedPrice = price.toFixed(pricePrecision);
    const formattedStopPrice = stopPrice.toFixed(pricePrecision);
    const formattedStopLimitPrice = stopLimitPrice.toFixed(pricePrecision);

    // eslint-disable-next-line no-console
    console.log("OCO Order Parameters (New API):", {
      symbol,
      quantity: formattedQuantity,
      abovePrice: formattedPrice,
      belowStopPrice: formattedStopPrice,
      belowPrice: formattedStopLimitPrice,
      tickSize,
      stepSize,
      pricePrecision,
      quantityPrecision,
    });

    // Use new OCO endpoint with above/below terminology
    // For SELL orders:
    // - aboveType: LIMIT_MAKER (take profit above current price)
    // - belowType: STOP_LOSS_LIMIT (stop loss below current price)
    const result = await this.signedRequest<BinanceOCOResponse>("POST", "/api/v3/orderList/oco", {
      symbol,
      side: "SELL",
      quantity: formattedQuantity,
      aboveType: "LIMIT_MAKER",
      abovePrice: formattedPrice,
      belowType: "STOP_LOSS_LIMIT",
      belowStopPrice: formattedStopPrice,
      belowPrice: formattedStopLimitPrice,
      belowTimeInForce: "GTC",
      newOrderRespType: "RESULT",
    });
    this.updateOrderRateLimit();
    return result;
  }

  async getOpenOrders(symbol?: string): Promise<BinanceOrderResponse[]> {
    const params = symbol ? { symbol } : {};
    return this.signedRequest<BinanceOrderResponse[]>(
      "GET",
      "/api/v3/openOrders",
      params
    );
  }

  async getAllOrders(symbol: string, limit = 500): Promise<BinanceOrderResponse[]> {
    return this.signedRequest<BinanceOrderResponse[]>("GET", "/api/v3/allOrders", {
      symbol,
      limit,
    });
  }

  async cancelOrder(symbol: string, orderId: number): Promise<BinanceOrderResponse> {
    await this.checkOrderRateLimit();
    const result = await this.signedRequest<BinanceOrderResponse>("DELETE", "/api/v3/order", {
      symbol,
      orderId,
    });
    this.updateOrderRateLimit();
    return result;
  }

  async cancelOCOOrder(
    symbol: string,
    orderListId: number
  ): Promise<BinanceOrderResponse> {
    await this.checkOrderRateLimit();
    const result = await this.signedRequest<BinanceOrderResponse>(
      "DELETE",
      "/api/v3/orderList",
      {
        symbol,
        orderListId,
      }
    );
    this.updateOrderRateLimit();
    return result;
  }

  /**
   * Query a specific OCO order by orderListId
   * Weight: 4
   * @param orderListId - The order list ID
   * @param origClientOrderId - Optional client order ID
   * @returns OCO order status from Binance
   */
  async getOCOOrder(
    orderListId: number,
    origClientOrderId?: string
  ): Promise<BinanceOCOResponse> {
    const params: Record<string, string | number> = {
      orderListId,
    };

    if (origClientOrderId) {
      params.origClientOrderId = origClientOrderId;
    }

    return this.signedRequest<BinanceOCOResponse>(
      "GET",
      "/api/v3/orderList",
      params
    );
  }

  /**
   * Query all OCO orders (max 1000)
   * Weight: 20
   * @param params - Optional query parameters
   * @returns Array of OCO orders
   */
  async getAllOCOOrders(params?: {
    fromId?: number;
    startTime?: number;
    endTime?: number;
    limit?: number; // Default 500, max 1000
  }): Promise<BinanceOCOResponse[]> {
    return this.signedRequest<BinanceOCOResponse[]>(
      "GET",
      "/api/v3/allOrderList",
      params || {}
    );
  }

  /**
   * Query a specific order by orderId
   * Weight: 4
   * @param symbol - Trading pair symbol
   * @param orderId - The order ID to query
   * @returns Order status from Binance
   */
  async getOrder(
    symbol: string,
    orderId: number
  ): Promise<{
    symbol: string;
    orderId: number;
    orderListId: number;
    clientOrderId: string;
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
    time: number;
    updateTime: number;
    isWorking: boolean;
    origQuoteOrderQty: string;
  }> {
    const params: Record<string, string | number> = {
      symbol,
      orderId,
    };

    return this.signedRequest(
      "GET",
      "/api/v3/order",
      params
    );
  }

  /**
   * Query open OCO orders
   * Weight: 6
   * @returns Array of open OCO orders
   */
  async getOpenOCOOrders(): Promise<BinanceOCOResponse[]> {
    return this.signedRequest<BinanceOCOResponse[]>(
      "GET",
      "/api/v3/openOrderList",
      {}
    );
  }

  getSymbolFilters(
    exchangeInfo: BinanceExchangeInfo,
    symbol: string
  ): BinanceSymbolFilter[] {
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    return symbolInfo?.filters || [];
  }

  getRateLimitInfo(): RateLimitInfo {
    return { ...this.rateLimit };
  }

  async createUserDataStream(): Promise<{ listenKey: string }> {
    // FIX: Binance API expects NO parameters - use empty object {} not null
    // Passing null is interpreted as a parameter, causing -1101 error
    const response = await this.axios.post<{ listenKey: string }>(
      "/api/v3/userDataStream",
      {},
      {
        headers: {
          "X-MBX-APIKEY": this.apiKey,
        },
      }
    );
    return response.data;
  }

  async keepAliveUserDataStream(listenKey: string): Promise<void> {
    // FIX: Use empty object {} instead of null for consistency
    await this.axios.put("/api/v3/userDataStream", {}, {
      params: { listenKey },
      headers: {
        "X-MBX-APIKEY": this.apiKey,
      },
    });
  }

  async closeUserDataStream(listenKey: string): Promise<void> {
    await this.axios.delete("/api/v3/userDataStream", {
      params: { listenKey },
      headers: {
        "X-MBX-APIKEY": this.apiKey,
      },
    });
  }

  getWebSocketURL(): string {
    const isTestnet = this.baseURL.includes("testnet.binance.vision");
    return isTestnet ? env.BINANCE_TESTNET_WS : env.BINANCE_WS_URL;
  }

  /**
   * Cleanup HTTP agents to free socket connections
   * Call this when BinanceClient instance is no longer needed
   * Prevents memory leaks when creating/destroying clients frequently
   */
  destroy(): void {
    const httpAgent = this.axios.defaults.httpAgent as HttpAgent | undefined;
    const httpsAgent = this.axios.defaults.httpsAgent as HttpsAgent | undefined;

    if (httpAgent && typeof httpAgent.destroy === "function") {
      httpAgent.destroy();
    }

    if (httpsAgent && typeof httpsAgent.destroy === "function") {
      httpsAgent.destroy();
    }
  }
}

export function createBinanceClient(
  apiKey: string,
  apiSecret: string,
  testnet = false
): BinanceClient {
  return new BinanceClient({ apiKey, apiSecret, testnet });
}

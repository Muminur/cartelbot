import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import crypto from "crypto";
import { env } from "@/lib/config/env";
import { BinanceAPIError } from "@/lib/utils/errors";
import {
  BinanceAccountInfo,
  BinanceOrderResponse,
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

    this.axios = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        "X-MBX-APIKEY": this.apiKey,
        "Content-Type": "application/json",
      },
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

        if (error instanceof BinanceAPIError && error.binanceCode !== undefined) {
          if (skipRetryOnCodes.includes(error.binanceCode)) {
            throw error;
          }

          if (error.binanceCode === -1021) {
            await this.syncServerTime();
            const delay = initialDelay * Math.pow(2, attempt);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }

          if (error.binanceCode === 429) {
            const delay = initialDelay * Math.pow(2, attempt + 1);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        }

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
    const response = await this.axios.get<BinanceTicker24hr>(
      "/api/v3/ticker/24hr",
      { params: { symbol } }
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
    const result = await this.signedRequest<BinanceOrderResponse>("POST", "/api/v3/order", {
      symbol,
      side: "SELL",
      type: "MARKET",
      quantity: quantity.toFixed(8),
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
  ): Promise<BinanceOrderResponse> {
    await this.checkOrderRateLimit();
    const result = await this.signedRequest<BinanceOrderResponse>("POST", "/api/v3/order/oco", {
      symbol,
      side: "SELL",
      quantity: quantity.toFixed(8),
      price: price.toFixed(8),
      stopPrice: stopPrice.toFixed(8),
      stopLimitPrice: stopLimitPrice.toFixed(8),
      stopLimitTimeInForce: "GTC",
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
    const response = await this.axios.post<{ listenKey: string }>(
      "/api/v3/userDataStream",
      null,
      {
        headers: {
          "X-MBX-APIKEY": this.apiKey,
        },
      }
    );
    return response.data;
  }

  async keepAliveUserDataStream(listenKey: string): Promise<void> {
    await this.axios.put("/api/v3/userDataStream", null, {
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
}

export function createBinanceClient(
  apiKey: string,
  apiSecret: string,
  testnet = false
): BinanceClient {
  return new BinanceClient({ apiKey, apiSecret, testnet });
}

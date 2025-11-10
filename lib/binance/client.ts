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

export class BinanceClient {
  private axios: AxiosInstance;
  private apiKey: string;
  private apiSecret: string;
  private baseURL: string;
  private rateLimit: RateLimitInfo = { weight: 0, lastReset: Date.now() };
  private readonly MAX_WEIGHT_PER_MINUTE = 6000;
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
            msg || "Binance API error",
            code || error.response.status
          );
        }
        throw error;
      }
    );
  }

  private updateRateLimit(weight: number): void {
    const now = Date.now();
    if (now - this.rateLimit.lastReset > 60000) {
      this.rateLimit = { weight, lastReset: now };
    } else {
      this.rateLimit.weight = weight;
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
    params: Record<string, any> = {}
  ): Promise<T> {
    const timestamp = Date.now();
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
    return this.signedRequest<BinanceOrderResponse>("POST", "/api/v3/order", {
      symbol,
      side: "BUY",
      type: "MARKET",
      quoteOrderQty: quoteOrderQty.toFixed(2),
    });
  }

  async createOCOOrder(
    symbol: string,
    quantity: number,
    price: number,
    stopPrice: number,
    stopLimitPrice: number
  ): Promise<BinanceOrderResponse> {
    return this.signedRequest<BinanceOrderResponse>("POST", "/api/v3/order/oco", {
      symbol,
      side: "SELL",
      quantity: quantity.toFixed(8),
      price: price.toFixed(8),
      stopPrice: stopPrice.toFixed(8),
      stopLimitPrice: stopLimitPrice.toFixed(8),
      stopLimitTimeInForce: "GTC",
    });
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
    return this.signedRequest<BinanceOrderResponse>("DELETE", "/api/v3/order", {
      symbol,
      orderId,
    });
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
}

export function createBinanceClient(
  apiKey: string,
  apiSecret: string,
  testnet = false
): BinanceClient {
  return new BinanceClient({ apiKey, apiSecret, testnet });
}

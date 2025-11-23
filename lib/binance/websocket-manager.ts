import WebSocket from "ws";
import { BinanceClient } from "./client";
import { WebSocketSession } from "@/lib/db/models";
import { EventEmitter } from "events";

interface WebSocketManagerConfig {
  userId: string;
  binanceClient: BinanceClient;
  onEvent?: (event: BinanceWebSocketEvent) => void;
}

export interface BinanceWebSocketEvent {
  eventType: string;
  eventTime: number;
  data: Record<string, unknown>;
}

interface ConnectionInfo {
  ws: WebSocket | null;
  listenKey: string;
  isActive: boolean;
  reconnectAttempts: number;
  keepAliveInterval: NodeJS.Timeout | null;
  reconnectTimeout: NodeJS.Timeout | null;
}

export class WebSocketManager extends EventEmitter {
  private userId: string;
  private binanceClient: BinanceClient;
  private connection: ConnectionInfo;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly KEEP_ALIVE_INTERVAL = 30 * 60 * 1000;
  private readonly RECONNECT_BASE_DELAY = 1000;

  constructor(config: WebSocketManagerConfig) {
    super();

    // Set max listeners to prevent memory leak warnings
    // We expect: 1 event listener + 1 maxReconnectReached listener = 2 total
    // Set to 5 to allow some flexibility without triggering false alarms
    this.setMaxListeners(5);

    this.userId = config.userId;
    this.binanceClient = config.binanceClient;
    this.connection = {
      ws: null,
      listenKey: "",
      isActive: false,
      reconnectAttempts: 0,
      keepAliveInterval: null,
      reconnectTimeout: null,
    };

    if (config.onEvent) {
      this.on("event", config.onEvent);
    }

    // Log initial listener count for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log(`[WebSocketManager ${this.userId}] Initialized with ${this.listenerCount('event')} event listeners`);
    }
  }

  async start(): Promise<string> {
    try {
      const { listenKey } = await this.binanceClient.createUserDataStream();
      this.connection.listenKey = listenKey;

      await this.updateSessionState("connecting", listenKey);

      await this.connect(listenKey);

      this.startKeepAlive();

      return listenKey;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to start WebSocket";
      await this.updateSessionState("error", this.connection.listenKey, errorMessage);
      throw error;
    }
  }

  private async connect(listenKey: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = this.binanceClient.getWebSocketURL();
        const url = `${wsUrl}/ws/${listenKey}`;

        this.connection.ws = new WebSocket(url);

        this.connection.ws.on("open", async () => {
          this.connection.isActive = true;
          this.connection.reconnectAttempts = 0;
          await this.updateSessionState("connected", listenKey);
          resolve();
        });

        this.connection.ws.on("message", (data: WebSocket.Data) => {
          try {
            const rawData = data.toString();

            // Validate data is not empty
            if (!rawData || rawData.trim() === '') {
              console.warn(`[WebSocket ${this.userId}] Received empty message`);
              return;
            }

            // Safe JSON parsing with validation
            try {
              const message = JSON.parse(rawData);

              // Validate parsed data is an object
              if (typeof message !== 'object' || message === null) {
                console.warn(`[WebSocket ${this.userId}] Parsed message is not an object:`, {
                  type: typeof message,
                  value: String(message).substring(0, 100),
                });
                return;
              }

              this.handleMessage(message);
            } catch (parseError) {
              // Log parse error with context
              console.error(`[WebSocket ${this.userId}] JSON parse failed:`, {
                error: parseError instanceof Error ? parseError.message : String(parseError),
                rawData: rawData.substring(0, 200),
                dataLength: rawData.length,
                firstChar: rawData.charAt(0),
                lastChar: rawData.charAt(rawData.length - 1),
              });
              return;
            }
          } catch (error) {
            console.error(`[WebSocket ${this.userId}] Message handling error:`, {
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            });
          }
        });

        this.connection.ws.on("ping", () => {
          this.connection.ws?.pong();
        });

        this.connection.ws.on("error", async (error) => {
          console.error(`WebSocket error for user ${this.userId}:`, error);
          await this.updateSessionState("error", listenKey, error.message);
        });

        this.connection.ws.on("close", async () => {
          this.connection.isActive = false;
          await this.updateSessionState("disconnected", listenKey);
          this.handleReconnect();
        });

        setTimeout(() => {
          if (!this.connection.isActive) {
            reject(new Error("WebSocket connection timeout"));
          }
        }, 10000);
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(message: Record<string, unknown>): void {
    const event: BinanceWebSocketEvent = {
      eventType: (message.e as string) || "unknown",
      eventTime: (message.E as number) || Date.now(),
      data: message,
    };

    this.emit("event", event);
  }

  private startKeepAlive(): void {
    if (this.connection.keepAliveInterval) {
      clearInterval(this.connection.keepAliveInterval);
    }

    this.connection.keepAliveInterval = setInterval(async () => {
      try {
        if (this.connection.listenKey && this.connection.isActive) {
          await this.binanceClient.keepAliveUserDataStream(this.connection.listenKey);
          await this.updateKeepAlive(this.connection.listenKey);
        }
      } catch (error) {
        console.error(`Keep-alive failed for user ${this.userId}:`, error);
        this.handleReconnect();
      }
    }, this.KEEP_ALIVE_INTERVAL);
  }

  private handleReconnect(): void {
    if (!this.connection.isActive && this.connection.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
      const delay = this.RECONNECT_BASE_DELAY * Math.pow(2, this.connection.reconnectAttempts);

      console.log(`Scheduling reconnect attempt ${this.connection.reconnectAttempts + 1} for user ${this.userId} in ${delay}ms`);

      this.connection.reconnectTimeout = setTimeout(async () => {
        this.connection.reconnectAttempts++;
        try {
          console.log(`Attempting reconnection ${this.connection.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS} for user ${this.userId}`);
          await this.connect(this.connection.listenKey);
          console.log(`Reconnection successful for user ${this.userId}`);
        } catch (error) {
          console.error(`Reconnection attempt ${this.connection.reconnectAttempts} failed for user ${this.userId}:`, error);
          this.handleReconnect();
        }
      }, delay);
    } else if (this.connection.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error(`Max reconnection attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached for user ${this.userId}`);
      this.emit("maxReconnectReached");
      this.cleanup();
    }
  }

  private async cleanup(): Promise<void> {
    console.log(`Cleaning up WebSocket connection for user ${this.userId}`);

    if (this.connection.keepAliveInterval) {
      clearInterval(this.connection.keepAliveInterval);
      this.connection.keepAliveInterval = null;
    }

    if (this.connection.reconnectTimeout) {
      clearTimeout(this.connection.reconnectTimeout);
      this.connection.reconnectTimeout = null;
    }

    if (this.connection.ws) {
      this.connection.ws.removeAllListeners();
      if (this.connection.ws.readyState === WebSocket.OPEN) {
        this.connection.ws.close();
      }
      this.connection.ws = null;
    }

    this.connection.isActive = false;
  }

  async stop(): Promise<void> {
    console.log(`Stopping WebSocket connection for user ${this.userId}`);

    // Log listener counts before cleanup (for debugging)
    if (process.env.NODE_ENV === 'development') {
      console.log(`[WebSocketManager ${this.userId}] Listeners before cleanup:`, {
        event: this.listenerCount('event'),
        maxReconnectReached: this.listenerCount('maxReconnectReached'),
        total: this.eventNames().reduce((acc, name) => acc + this.listenerCount(name), 0),
      });
    }

    await this.cleanup();

    const listenKey = this.connection.listenKey;

    if (listenKey) {
      try {
        await this.binanceClient.closeUserDataStream(listenKey);
        console.log(`Closed user data stream for user ${this.userId}`);
      } catch (error) {
        console.error(`Failed to close user data stream for user ${this.userId}:`, error);
      }
    }

    await this.updateSessionState("disconnected", listenKey);

    this.connection.listenKey = "";
    this.connection.reconnectAttempts = 0;

    // Remove all event listeners to prevent memory leaks
    this.removeAllListeners();

    // Log final listener count (should be 0)
    if (process.env.NODE_ENV === 'development') {
      console.log(`[WebSocketManager ${this.userId}] Listeners after cleanup:`, {
        total: this.eventNames().reduce((acc, name) => acc + this.listenerCount(name), 0),
      });
    }
  }

  private async updateSessionState(
    state: "connecting" | "connected" | "disconnected" | "error",
    listenKey: string,
    errorMessage?: string
  ): Promise<void> {
    try {
      await WebSocketSession.findOneAndUpdate(
        { userId: this.userId, listenKey },
        {
          connectionState: state,
          isActive: state === "connected",
          ...(errorMessage && { errorMessage }),
          ...(state === "connected" && { lastKeepAlive: new Date() }),
        },
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error(`Failed to update session state for user ${this.userId}:`, error);
    }
  }

  private async updateKeepAlive(listenKey: string): Promise<void> {
    try {
      await WebSocketSession.findOneAndUpdate(
        { userId: this.userId, listenKey },
        { lastKeepAlive: new Date() }
      );
    } catch (error) {
      console.error(`Failed to update keep-alive for user ${this.userId}:`, error);
    }
  }

  getConnectionStatus(): {
    isActive: boolean;
    listenKey: string;
    reconnectAttempts: number;
  } {
    return {
      isActive: this.connection.isActive,
      listenKey: this.connection.listenKey,
      reconnectAttempts: this.connection.reconnectAttempts,
    };
  }

  /**
   * Get current listener counts for debugging memory leaks
   */
  getListenerInfo(): {
    event: number;
    maxReconnectReached: number;
    total: number;
    maxListeners: number;
    eventNames: string[];
  } {
    const eventNames = this.eventNames().map(String);
    return {
      event: this.listenerCount('event'),
      maxReconnectReached: this.listenerCount('maxReconnectReached'),
      total: eventNames.reduce((acc, name) => acc + this.listenerCount(name), 0),
      maxListeners: this.getMaxListeners(),
      eventNames,
    };
  }
}

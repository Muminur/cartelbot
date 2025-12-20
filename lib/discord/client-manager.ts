/**
 * Multi-User Discord Client Manager
 *
 * Manages multiple Discord self-bot clients for different users with:
 * - Multi-user support (max 10 concurrent clients)
 * - Auto-reconnection with exponential backoff
 * - Client lifecycle management (start/stop/status)
 * - Event handling (ready, message, disconnect, error)
 * - Graceful shutdown
 *
 * STEALTH FEATURES:
 * - Uses discord.js-selfbot-v13 for user account login
 * - Proper intent configuration for message events
 * - Connection state tracking
 * - Error recovery
 */

import { Client, Intents } from "discord.js-selfbot-v13";
import type {
  ManagedClient,
  ClientStatus,
  StartClientResult,
  StopClientResult,
  AllClientsStatus,
  MessageHandlerConfig,
} from "./types";
import { DiscordMessageHandler } from "./message-handler";

/**
 * Wrapper for Discord client with metadata
 */
class ManagedClientWrapper implements ManagedClient {
  userId: string;
  connectionId: string;
  client: Client;
  handler: DiscordMessageHandler;
  serverId: string;
  channelId: string;
  startedAt: Date;
  reconnectCount: number;
  lastError: string | null;

  constructor(
    userId: string,
    connectionId: string,
    client: Client,
    handler: DiscordMessageHandler,
    serverId: string,
    channelId: string
  ) {
    this.userId = userId;
    this.connectionId = connectionId;
    this.client = client;
    this.handler = handler;
    this.serverId = serverId;
    this.channelId = channelId;
    this.startedAt = new Date();
    this.reconnectCount = 0;
    this.lastError = null;
  }

  getStatus(): ClientStatus {
    return {
      userId: this.userId,
      connectionId: this.connectionId,
      connected: this.client.readyAt !== null && !this.client.user?.bot,
      serverId: this.serverId,
      channelId: this.channelId,
      startedAt: this.startedAt.toISOString(),
      reconnectCount: this.reconnectCount,
      lastError: this.lastError,
    };
  }
}

/**
 * Discord Client Manager
 * Singleton class for managing multiple Discord self-bot clients
 */
export class DiscordClientManager {
  private static instance: DiscordClientManager;
  private clients: Map<string, ManagedClient>;
  private maxClients: number;
  private minDelay: number;
  private maxDelay: number;

  private constructor() {
    this.clients = new Map();
    this.maxClients = parseInt(process.env.MAX_DISCORD_CLIENTS || "10", 10);
    this.minDelay = parseFloat(process.env.MESSAGE_DELAY_MIN || "1");
    this.maxDelay = parseFloat(process.env.MESSAGE_DELAY_MAX || "3");

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[DiscordClientManager] Initialized (max_clients=${this.maxClients}, ` +
          `delay=${this.minDelay}-${this.maxDelay}s)`
      );
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(): DiscordClientManager {
    if (!DiscordClientManager.instance) {
      DiscordClientManager.instance = new DiscordClientManager();
    }
    return DiscordClientManager.instance;
  }

  /**
   * Start a Discord client for a user
   */
  async startClient(
    userId: string,
    connectionId: string,
    token: string,
    serverId: string,
    channelId: string
  ): Promise<StartClientResult> {
    // Check if client already exists
    if (this.clients.has(userId)) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[DiscordClientManager] Client for user ${userId} already exists`);
      }
      return {
        success: false,
        error: "Client already running for this user",
      };
    }

    // Check max clients limit
    if (this.clients.size >= this.maxClients) {
      if (process.env.NODE_ENV !== "production") {
        console.error(
          `[DiscordClientManager] Max clients limit (${this.maxClients}) reached`
        );
      }
      return {
        success: false,
        error: `Maximum client limit (${this.maxClients}) reached`,
      };
    }

    try {
      // Validate token format
      if (!token || token.length < 50 || token.length > 150) {
        if (process.env.NODE_ENV !== "production") {
          console.error(`[DiscordClientManager] Invalid token format for user ${userId}`);
        }
        return {
          success: false,
          error: "Invalid Discord token format",
        };
      }

      // Create message handler
      const handlerConfig: MessageHandlerConfig = {
        userId,
        connectionId,
        monitoredChannelId: channelId,
        minDelay: this.minDelay,
        maxDelay: this.maxDelay,
      };
      const handler = new DiscordMessageHandler(handlerConfig);

      // Create Discord client with required intents
      // discord.js-selfbot-v13 has different type definitions than standard discord.js
      const client = new Client({
        intents: [
          Intents.FLAGS.GUILDS,
          Intents.FLAGS.GUILD_MESSAGES,
          Intents.FLAGS.DIRECT_MESSAGES,
        ],
      } as any);

      // Set up event handlers
      client.on("ready", () => {
        if (process.env.NODE_ENV !== "production") {
          console.log(
            `[DiscordClientManager] Client connected as ${client.user?.tag} (user_id: ${userId})`
          );
          console.log(`[Event System] on_ready handler registered and fired for user ${userId}`);
        }
      });

      client.on("messageCreate", async (message) => {
        // Log every message event (diagnostic)
        if (process.env.NODE_ENV !== "production") {
          console.log(
            `[Event System] on_messageCreate fired: channel=${message.channel.id}, ` +
              `author=${message.author?.tag || "unknown"}`
          );
        }
        await handler.onMessage(message);
      });

      client.on("disconnect", () => {
        if (process.env.NODE_ENV !== "production") {
          console.warn(`[DiscordClientManager] Client disconnected (user_id: ${userId})`);
        }
      });

      client.on("error", (error) => {
        if (process.env.NODE_ENV !== "production") {
          console.error(`[DiscordClientManager] Client error (user_id: ${userId}):`, error);
        }
        const managed = this.clients.get(userId);
        if (managed) {
          managed.lastError = error.message;
        }
      });

      // Create managed client wrapper
      const managed = new ManagedClientWrapper(
        userId,
        connectionId,
        client,
        handler,
        serverId,
        channelId
      );

      // Store client before login
      this.clients.set(userId, managed);

      // Start client with auto-reconnect
      this.runClientWithReconnect(userId, token);

      if (process.env.NODE_ENV !== "production") {
        console.log(`[DiscordClientManager] Started Discord client for user ${userId}`);
      }

      return {
        success: true,
        status: managed.getStatus(),
      };
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error(
          `[DiscordClientManager] Unexpected error starting client for user ${userId}:`,
          error
        );
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : "Internal error",
      };
    }
  }

  /**
   * Run Discord client with auto-reconnect logic
   */
  private async runClientWithReconnect(
    userId: string,
    token: string
  ): Promise<void> {
    const maxReconnectAttempts = 5;
    const baseDelay = 5000; // 5 seconds

    while (this.clients.has(userId)) {
      const managed = this.clients.get(userId);
      if (!managed) break;

      try {
        await managed.client.login(token);
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.error(
            `[DiscordClientManager] Discord client error for user ${userId}:`,
            error
          );
        }

        // Check if it's an invalid token error
        if (
          error instanceof Error &&
          (error.message.includes("TOKEN_INVALID") ||
            error.message.includes("Improper token"))
        ) {
          if (process.env.NODE_ENV !== "production") {
            console.error(`[DiscordClientManager] Invalid Discord token for user ${userId}`);
          }
          managed.lastError = "Invalid token";
          await this.stopClient(userId);
          break;
        }

        // Increment reconnect count
        managed.lastError = error instanceof Error ? error.message : "Unknown error";
        managed.reconnectCount++;

        // Check reconnect limit
        if (managed.reconnectCount >= maxReconnectAttempts) {
          if (process.env.NODE_ENV !== "production") {
            console.error(
              `[DiscordClientManager] Max reconnect attempts (${maxReconnectAttempts}) ` +
                `reached for user ${userId}`
            );
          }
          await this.stopClient(userId);
          break;
        }

        // Exponential backoff
        const delay = baseDelay * Math.pow(2, managed.reconnectCount - 1);
        if (process.env.NODE_ENV !== "production") {
          console.log(
            `[DiscordClientManager] Reconnecting in ${delay / 1000}s ` +
              `(attempt ${managed.reconnectCount})`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Stop a Discord client
   */
  async stopClient(userId: string): Promise<StopClientResult> {
    const managed = this.clients.get(userId);
    if (!managed) {
      return {
        success: false,
        error: "Client not found",
      };
    }

    try {
      // Destroy Discord client
      if (managed.client.readyAt !== null) {
        await managed.client.destroy();
      }

      // Remove from clients map
      this.clients.delete(userId);

      if (process.env.NODE_ENV !== "production") {
        console.log(`[DiscordClientManager] Stopped Discord client for user ${userId}`);
      }

      return {
        success: true,
        message: "Client stopped successfully",
      };
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error(
          `[DiscordClientManager] Error stopping client for user ${userId}:`,
          error
        );
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get status of a specific client
   */
  getStatus(userId: string): ClientStatus | null {
    const managed = this.clients.get(userId);
    return managed ? managed.getStatus() : null;
  }

  /**
   * Get status of all clients
   */
  getAllStatuses(): AllClientsStatus {
    const clientStatuses: Record<string, ClientStatus> = {};

    for (const [userId, managed] of this.clients.entries()) {
      clientStatuses[userId] = managed.getStatus();
    }

    return {
      activeClients: this.clients.size,
      maxClients: this.maxClients,
      clients: clientStatuses,
    };
  }

  /**
   * Stop all running clients (for shutdown)
   */
  async stopAllClients(): Promise<void> {
    const userIds = Array.from(this.clients.keys());

    for (const userId of userIds) {
      await this.stopClient(userId);
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[DiscordClientManager] All Discord clients stopped");
    }
  }

  /**
   * Get number of active clients
   */
  getActiveClientCount(): number {
    return this.clients.size;
  }
}

// Export singleton instance getter
export const getDiscordClientManager = () =>
  DiscordClientManager.getInstance();

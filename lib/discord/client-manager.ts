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

import { Client } from "discord.js-selfbot-v13";
import type {
  ManagedClient,
  ClientStatus,
  StartClientResult,
  StopClientResult,
  AllClientsStatus,
  MessageHandlerConfig,
} from "./types";
import { DiscordMessageHandler } from "./message-handler";
import { encrypt, decrypt } from "@/lib/encryption";

/** Login timeout in milliseconds (30 seconds) */
const LOGIN_TIMEOUT_MS = 30000;
/** Maximum reconnect delay in milliseconds (30 seconds) */
const MAX_RECONNECT_DELAY_MS = 30000;

/**
 * Wrapper for Discord client with metadata
 * Stores encrypted token for secure reconnection
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
  /** Encrypted token for secure storage - decrypted only when needed for reconnect */
  private encryptedToken: string;

  constructor(
    userId: string,
    connectionId: string,
    client: Client,
    handler: DiscordMessageHandler,
    serverId: string,
    channelId: string,
    token: string
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
    // Encrypt token immediately - never store plaintext
    this.encryptedToken = encrypt(token);
  }

  /** Get decrypted token for login (use sparingly) */
  getToken(): string {
    return decrypt(this.encryptedToken);
  }

  /** Clear sensitive data from memory */
  clearSensitiveData(): void {
    this.encryptedToken = "";
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

      // Create Discord client for selfbot
      // discord.js-selfbot-v13 doesn't require intents for user accounts
      // Using numeric intent values to avoid deprecation warning
      // GUILDS = 1, GUILD_MESSAGES = 512, DIRECT_MESSAGES = 4096
      const client = new Client({
        checkUpdate: false, // Disable update check
      } as unknown as ConstructorParameters<typeof Client>[0]);

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

      // Create managed client wrapper (token is encrypted internally)
      const managed = new ManagedClientWrapper(
        userId,
        connectionId,
        client,
        handler,
        serverId,
        channelId,
        token
      );

      // Store client before login
      this.clients.set(userId, managed);

      // Start client with auto-reconnect (no plaintext token passed)
      this.runClientWithReconnect(userId);

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
   * Login with timeout to prevent hanging indefinitely
   */
  private async loginWithTimeout(client: Client, token: string): Promise<string> {
    return Promise.race([
      client.login(token),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("Login timeout")), LOGIN_TIMEOUT_MS)
      ),
    ]);
  }

  /**
   * Fetch and process messages that were sent while the server was down.
   * Uses the lastProcessedMessageId stored in the DiscordConnection to know where to start.
   */
  private async fetchMissedMessages(userId: string, managed: ManagedClientWrapper): Promise<void> {
    const { connectDB } = await import('@/lib/db/connection');
    const { DiscordConnection } = await import('@/lib/db/models/DiscordConnection');

    await connectDB();

    // Get the connection's last processed message ID
    const connection = await DiscordConnection.findById(managed.connectionId)
      .select('lastProcessedMessageId channelId')
      .lean() as { lastProcessedMessageId?: string | null; channelId?: string } | null;

    if (!connection?.lastProcessedMessageId) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[DiscordClientManager] No lastProcessedMessageId for user ${userId}, skipping catch-up`);
      }
      return;
    }

    // Fetch the channel
    const channel = managed.client.channels.cache.get(managed.channelId);
    if (!channel || !('messages' in channel)) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[DiscordClientManager] Channel ${managed.channelId} not found in cache for user ${userId}`);
      }
      return;
    }

    // Fetch messages after the last processed one (max 50 to avoid rate limits)
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[DiscordClientManager] Fetching missed messages for user ${userId} after message ${connection.lastProcessedMessageId}`
      );
    }

    try {
      const textChannel = channel as import('discord.js-selfbot-v13').TextChannel;
      const messages = await textChannel.messages.fetch({
        after: connection.lastProcessedMessageId,
        limit: 50,
      });

      if (messages.size === 0) {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[DiscordClientManager] No missed messages for user ${userId}`);
        }
        return;
      }

      if (process.env.NODE_ENV !== 'production') {
        console.log(`[DiscordClientManager] Found ${messages.size} missed message(s) for user ${userId}`);
      }

      // Process messages in chronological order (oldest first)
      const sortedMessages = [...messages.values()].sort(
        (a, b) => a.createdTimestamp - b.createdTimestamp
      );

      for (const msg of sortedMessages) {
        // Use the existing message handler — it has dedup built in
        await managed.handler.onMessage(msg);
        // Small delay between processing to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      if (process.env.NODE_ENV !== 'production') {
        console.log(`[DiscordClientManager] Finished processing ${sortedMessages.length} missed message(s) for user ${userId}`);
      }
    } catch (fetchError) {
      console.warn(
        `[DiscordClientManager] Error fetching channel messages for user ${userId}:`,
        fetchError instanceof Error ? fetchError.message : String(fetchError)
      );
    }
  }

  /**
   * Run Discord client with auto-reconnect logic
   * Token is retrieved from encrypted storage when needed
   *
   * After successful login, waits for the client to disconnect before
   * attempting reconnection. Without this wait, the loop would immediately
   * re-login on an already-connected client, causing a 30s timeout.
   */
  private async runClientWithReconnect(userId: string): Promise<void> {
    const maxReconnectAttempts = 5;
    const baseDelay = 5000; // 5 seconds

    while (this.clients.has(userId)) {
      const managed = this.clients.get(userId) as ManagedClientWrapper | undefined;
      if (!managed) break;

      try {
        // Decrypt token only when needed for login
        const token = managed.getToken();
        await this.loginWithTimeout(managed.client, token);

        // Login succeeded - reset reconnect count
        managed.reconnectCount = 0;
        managed.lastError = null;

        if (process.env.NODE_ENV !== "production") {
          console.log(
            `[DiscordClientManager] Client logged in successfully for user ${userId}, waiting for disconnect...`
          );
        }

        // After successful login, fetch missed messages from the channel
        try {
          await this.fetchMissedMessages(userId, managed);
        } catch (fetchError) {
          console.warn(
            `[DiscordClientManager] Failed to fetch missed messages for user ${userId}:`,
            fetchError instanceof Error ? fetchError.message : String(fetchError)
          );
          // Don't fail the connection over missed message fetch failure
        }

        // Wait for the client to disconnect before attempting reconnect.
        // This prevents the loop from immediately re-logging in on an
        // already-connected client (which caused the "Login timeout" bug).
        await new Promise<void>((resolve) => {
          const onDisconnect = () => {
            cleanup();
            resolve();
          };
          const onClose = () => {
            cleanup();
            resolve();
          };
          const cleanup = () => {
            managed.client.removeListener("disconnect", onDisconnect);
            managed.client.removeListener("close", onClose);
          };
          managed.client.on("disconnect", onDisconnect);
          managed.client.on("close", onClose);
        });

        if (process.env.NODE_ENV !== "production") {
          console.log(
            `[DiscordClientManager] Client disconnected for user ${userId}, will attempt reconnect...`
          );
        }
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.error(
            `[DiscordClientManager] Discord client error for user ${userId}:`,
            error
          );
        }

        // Check if it's an invalid token or timeout error
        if (
          error instanceof Error &&
          (error.message.includes("TOKEN_INVALID") ||
            error.message.includes("Improper token") ||
            error.message.includes("Login timeout"))
        ) {
          if (process.env.NODE_ENV !== "production") {
            console.error(`[DiscordClientManager] ${error.message} for user ${userId}`);
          }
          managed.lastError = error.message;
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

        // Exponential backoff with max cap
        const delay = Math.min(
          baseDelay * Math.pow(2, managed.reconnectCount - 1),
          MAX_RECONNECT_DELAY_MS
        );
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
   * Stop a Discord client and cleanup all resources
   */
  async stopClient(userId: string): Promise<StopClientResult> {
    const managed = this.clients.get(userId) as ManagedClientWrapper | undefined;
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

      // Clear sensitive data from memory
      managed.clearSensitiveData();

      // Cleanup message handler resources
      if (managed.handler && typeof managed.handler.destroy === "function") {
        managed.handler.destroy();
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

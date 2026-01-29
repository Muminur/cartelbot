/**
 * Discord Message Handler with 4-Layer Filtering
 *
 * Handles incoming Discord messages with intelligent filtering,
 * sanitization, and forwarding to Next.js webhook endpoint.
 *
 * FILTERING LAYERS:
 * 1. Channel ID check - Only process messages from monitored channel
 * 2. Bot filter - Ignore messages from bot accounts
 * 3. In-memory deduplication - Check processed message IDs
 * 4. Database deduplication - Check against DiscordMessage collection
 *
 * STEALTH FEATURES:
 * - Random human-like delays (1-3 seconds)
 * - Content sanitization (remove mentions, emojis)
 * - Natural processing patterns
 */

import type { Message } from "discord.js-selfbot-v13";
import type {
  MessageHandlerConfig,
  DiscordMessagePayload,
} from "./types";
import { DiscordMessage } from "@/lib/db/models/DiscordMessage";
import { discordEventEmitter } from "./event-emitter";
import axios from "axios";

/** Maximum cached message IDs to prevent memory leaks */
const MAX_CACHE_SIZE = 10000;
/** Cache TTL in milliseconds (1 hour) */
const CACHE_TTL_MS = 3600000;
/** Cleanup interval in milliseconds (5 minutes) */
const CLEANUP_INTERVAL_MS = 300000;

/**
 * Message handler class for filtering and processing Discord messages
 */
export class DiscordMessageHandler {
  private userId: string;
  private connectionId: string;
  private monitoredChannelId: string;
  private minDelay: number;
  private maxDelay: number;
  /** Map of messageId -> timestamp for TTL-based cache */
  private processedMessages: Map<string, number>;
  private webhookUrl: string;
  private webhookSecret: string;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: MessageHandlerConfig) {
    this.userId = config.userId;
    this.connectionId = config.connectionId;
    this.monitoredChannelId = String(config.monitoredChannelId);
    this.minDelay = config.minDelay;
    this.maxDelay = config.maxDelay;
    this.processedMessages = new Map();

    // Configure webhook URL
    this.webhookUrl = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/api/discord/webhook/message`;
    // Support both env var names for compatibility
    this.webhookSecret = process.env.DISCORD_WEBHOOK_SECRET || process.env.NEXTJS_WEBHOOK_SECRET || "";

    if (!this.webhookSecret && process.env.NODE_ENV !== "production") {
      console.warn("[DiscordMessageHandler] DISCORD_WEBHOOK_SECRET not set - messages won't be forwarded securely");
    }

    // Start cache cleanup interval to prevent memory leaks
    this.cleanupInterval = setInterval(() => this.cleanupCache(), CLEANUP_INTERVAL_MS);
  }

  /**
   * Cleanup stale entries from processed messages cache
   * Prevents unbounded memory growth in long-running clients
   */
  private cleanupCache(): void {
    const now = Date.now();
    let removedCount = 0;

    // Remove expired entries (TTL-based)
    for (const [id, timestamp] of this.processedMessages) {
      if (now - timestamp > CACHE_TTL_MS) {
        this.processedMessages.delete(id);
        removedCount++;
      }
    }

    // Hard limit: remove oldest entries if still over max size
    if (this.processedMessages.size > MAX_CACHE_SIZE) {
      const entries = Array.from(this.processedMessages.entries())
        .sort((a, b) => a[1] - b[1]);
      const toRemove = entries.slice(0, this.processedMessages.size - MAX_CACHE_SIZE);
      for (const [id] of toRemove) {
        this.processedMessages.delete(id);
        removedCount++;
      }
    }

    if (removedCount > 0 && process.env.NODE_ENV !== "production") {
      console.log(`[DiscordMessageHandler] Cache cleanup: removed ${removedCount} entries, ${this.processedMessages.size} remaining`);
    }
  }

  /**
   * Stop the handler and cleanup resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.processedMessages.clear();
  }

  /**
   * Handle incoming Discord message with 4-layer filtering
   */
  async onMessage(message: Message): Promise<void> {
    try {
      // Enhanced diagnostic logging for ALL messages
      if (process.env.NODE_ENV !== "production") {
        console.log(
          `[MESSAGE RECEIVED] ID=${message.id}, Channel=${message.channel.id}, ` +
            `Author=${message.author?.tag || "unknown"} (bot=${message.author?.bot || false}), ` +
            `Content preview: ${message.content?.substring(0, 50) || "(empty)"}`
        );
      }

      // FILTER 1: Check if message is from monitored channel
      if (String(message.channel.id) !== this.monitoredChannelId) {
        if (process.env.NODE_ENV !== "production") {
          console.log(
            `[FILTER 1: SKIP] Message ${message.id} from channel ${message.channel.id} ` +
              `(monitoring ${this.monitoredChannelId})`
          );
        }
        return;
      }

      // FILTER 2: Ignore bot messages
      if (message.author?.bot) {
        if (process.env.NODE_ENV !== "production") {
          console.log(
            `[FILTER 2: SKIP] Message ${message.id} from bot ${message.author.tag}`
          );
        }
        return;
      }

      // FILTER 3: Check for duplicate (in-memory with TTL)
      const messageId = String(message.id);
      if (this.processedMessages.has(messageId)) {
        if (process.env.NODE_ENV !== "production") {
          console.log(
            `[FILTER 3: SKIP] Duplicate message ${messageId} (in-memory)`
          );
        }
        return;
      }

      // FILTER 4: Check for duplicate in database
      const isDuplicate = await this.checkDuplicateInDb(messageId);
      if (isDuplicate) {
        if (process.env.NODE_ENV !== "production") {
          console.log(
            `[FILTER 4: SKIP] Duplicate message ${messageId} (database)`
          );
        }
        this.processedMessages.set(messageId, Date.now());
        return;
      }

      // Message passed all filters
      if (process.env.NODE_ENV !== "production") {
        console.log(`[FILTERS PASSED] Message ${messageId} will be processed`);
      }

      // Add random human-like delay (1-3 seconds)
      const delay = this.getRandomDelay();
      await this.sleep(delay);

      // Sanitize message content
      const sanitizedContent = this.sanitizeContent(message.content || "");

      // Build message payload
      const messageData: DiscordMessagePayload = {
        userId: this.userId,
        connectionId: this.connectionId,
        discordMessageId: messageId,
        serverId: message.guild?.id || null,
        channelId: String(message.channel.id),
        authorId: String(message.author?.id || ""),
        authorUsername: message.author?.tag || "Unknown",
        content: sanitizedContent,
        timestamp: message.createdAt?.toISOString() || new Date().toISOString(),
      };

      if (process.env.NODE_ENV !== "production") {
        console.log(
          `[Processing] Message ${messageId} from ${message.author?.tag} ` +
            `in channel ${this.monitoredChannelId}`
        );
      }

      // Emit message_received event
      discordEventEmitter.emitSignalEvent({
        type: "message_received",
        userId: this.userId,
        connectionId: this.connectionId,
        messageId,
        timestamp: new Date(),
        data: {
          message: `Received message from ${message.author?.tag}`,
        },
      });

      // Forward to Next.js API webhook
      const success = await this.forwardToWebhook(messageData);

      if (success) {
        // Mark as processed
        this.processedMessages.set(messageId, Date.now());

        // Store in database for deduplication across restarts
        await this.storeProcessedMessage(messageId);

        // Update last processed message ID for catch-up on reconnect
        try {
          const { DiscordConnection } = await import('@/lib/db/models/DiscordConnection');
          await DiscordConnection.findByIdAndUpdate(
            this.connectionId,
            { lastProcessedMessageId: messageId },
            { new: false }  // Don't need the updated doc
          );
        } catch (updateError) {
          // Non-critical — don't fail message processing over this
          if (process.env.NODE_ENV !== "production") {
            console.warn(`[MessageHandler] Failed to update lastProcessedMessageId:`, updateError);
          }
        }
      } else {
        if (process.env.NODE_ENV !== "production") {
          console.error(`[Error] Failed to forward message ${messageId}`);
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error(`[Error] Handling message ${message.id}:`, error);
      }
    }
  }

  /**
   * Check if message was already processed (database lookup)
   */
  private async checkDuplicateInDb(messageId: string): Promise<boolean> {
    try {
      const result = await DiscordMessage.findOne({
        connectionId: this.connectionId,
        discordMessageId: messageId,
      });
      return result !== null;
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[Error] Database duplicate check failed:", error);
      }
      return false; // Assume not duplicate on error
    }
  }

  /**
   * Store processed message ID in database for deduplication
   */
  private async storeProcessedMessage(messageId: string): Promise<void> {
    try {
      await DiscordMessage.findOneAndUpdate(
        {
          connectionId: this.connectionId,
          discordMessageId: messageId,
        },
        {
          $set: {
            userId: this.userId,
            processedAt: new Date(),
          },
        },
        { upsert: true }
      );
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error(
          `[Error] Failed to store processed message ${messageId}:`,
          error
        );
      }
    }
  }

  /**
   * Forward message to Next.js webhook endpoint
   */
  private async forwardToWebhook(
    messageData: DiscordMessagePayload
  ): Promise<boolean> {
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "User-Agent": "CartelBot-Discord-Service/1.0",
        };

        // Add webhook secret for authentication
        if (this.webhookSecret) {
          headers["X-Webhook-Secret"] = this.webhookSecret;
        }

        const response = await axios.post(this.webhookUrl, messageData, {
          headers,
          timeout: 10000,
        });

        if (response.status === 200) {
          if (process.env.NODE_ENV !== "production") {
            console.log(
              `[Success] Forwarded message ${messageData.discordMessageId} to Next.js API`
            );
          }
          return true;
        } else if (response.status === 401) {
          if (process.env.NODE_ENV !== "production") {
            console.error("[Error] Webhook authentication failed - invalid secret");
          }
          return false;
        } else {
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              `[Warning] Forward attempt ${attempt}/${maxRetries} failed: HTTP ${response.status}`
            );
          }
        }
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            `[Warning] Forward attempt ${attempt}/${maxRetries} failed:`,
            error
          );
        }
      }

      // Wait before retry (except on last attempt)
      if (attempt < maxRetries) {
        await this.sleep(retryDelay * attempt); // Exponential backoff
      }
    }

    if (process.env.NODE_ENV !== "production") {
      console.error(
        `[Error] Failed to forward message ${messageData.discordMessageId} after ${maxRetries} attempts`
      );
    }
    return false;
  }

  /**
   * Sanitize Discord message content
   * Removes mentions, emojis, and other Discord-specific formatting
   */
  private sanitizeContent(content: string): string {
    if (!content) return "";

    let sanitized = content;

    // Remove user mentions: <@123456789>
    sanitized = sanitized.replace(/<@!?\d+>/g, "");

    // Remove role mentions: <@&123456789>
    sanitized = sanitized.replace(/<@&\d+>/g, "");

    // Remove channel mentions: <#123456789>
    sanitized = sanitized.replace(/<#\d+>/g, "");

    // Remove custom emojis: <:name:123456789> or <a:name:123456789>
    sanitized = sanitized.replace(/<a?:\w+:\d+>/g, "");

    // Remove @everyone and @here mentions
    sanitized = sanitized.replace(/@everyone/g, "").replace(/@here/g, "");

    // Clean up extra whitespace
    sanitized = sanitized.split(/\s+/).join(" ");

    return sanitized.trim();
  }

  /**
   * Get random delay between min and max (in milliseconds)
   */
  private getRandomDelay(): number {
    return (
      Math.random() * (this.maxDelay - this.minDelay) + this.minDelay
    ) * 1000;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

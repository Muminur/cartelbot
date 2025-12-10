/**
 * Discord Signal Event Emitter
 *
 * Server-side event emitter for Discord signal notifications
 * Broadcasts events to connected SSE clients for real-time updates
 */

import { EventEmitter } from "events";

export interface DiscordSignalEvent {
  type: "message_received" | "parsing" | "parsed" | "executing" | "target_hit" | "stop_loss" | "completed" | "failed";
  userId: string;
  connectionId: string;
  messageId: string;
  timestamp: Date;
  data: {
    symbol?: string;
    status?: string;
    confidence?: number;
    error?: string;
    signalId?: string;
    tradeId?: string;
    targetNumber?: number;
    pnl?: number;
    pnlPercentage?: number;
    message?: string;
  };
}

class DiscordEventEmitter extends EventEmitter {
  private static instance: DiscordEventEmitter;

  private constructor() {
    super();
    this.setMaxListeners(100); // Support many concurrent SSE connections
  }

  static getInstance(): DiscordEventEmitter {
    if (!DiscordEventEmitter.instance) {
      DiscordEventEmitter.instance = new DiscordEventEmitter();
    }
    return DiscordEventEmitter.instance;
  }

  /**
   * Emit Discord signal event to all connected clients for a specific user
   */
  emitSignalEvent(event: DiscordSignalEvent): void {
    const eventKey = `discord:${event.userId}`;

    if (process.env.NODE_ENV !== "production") {
      console.log(`[DiscordEventEmitter] Emitting ${event.type} for user ${event.userId}`, {
        messageId: event.messageId,
        symbol: event.data.symbol,
        status: event.data.status,
      });
    }

    this.emit(eventKey, event);
  }

  /**
   * Subscribe to Discord events for a specific user
   * Returns unsubscribe function
   */
  subscribeToUserEvents(
    userId: string,
    callback: (event: DiscordSignalEvent) => void
  ): () => void {
    const eventKey = `discord:${userId}`;
    this.on(eventKey, callback);

    // Return cleanup function
    return () => {
      this.off(eventKey, callback);
    };
  }

  /**
   * Get listener count for debugging
   */
  getUserListenerCount(userId: string): number {
    const eventKey = `discord:${userId}`;
    return this.listenerCount(eventKey);
  }
}

// Export singleton instance
export const discordEventEmitter = DiscordEventEmitter.getInstance();

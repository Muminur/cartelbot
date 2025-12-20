/**
 * TypeScript types for Discord client management
 *
 * Defines interfaces for Discord client operations, message handling,
 * and client status tracking across the application.
 */

import type { Client, Message } from "discord.js-selfbot-v13";

/**
 * Discord client status information
 */
export interface ClientStatus {
  userId: string;
  connectionId: string;
  connected: boolean;
  serverId: string;
  channelId: string;
  startedAt: string;
  reconnectCount: number;
  lastError: string | null;
}

/**
 * Managed Discord client wrapper
 * Contains client instance and metadata for tracking
 */
export interface ManagedClient {
  userId: string;
  connectionId: string;
  client: Client;
  handler: MessageHandler;
  serverId: string;
  channelId: string;
  startedAt: Date;
  reconnectCount: number;
  lastError: string | null;
  getStatus(): ClientStatus;
}

/**
 * Message handler for filtering and processing Discord messages
 */
export interface MessageHandler {
  onMessage(message: Message): Promise<void>;
}

/**
 * Discord message data to forward to Next.js API
 */
export interface DiscordMessagePayload {
  userId: string;
  connectionId: string;
  discordMessageId: string;
  serverId: string | null;
  channelId: string;
  authorId: string;
  authorUsername: string;
  content: string;
  timestamp: string;
}

/**
 * Result of starting a Discord client
 */
export interface StartClientResult {
  success: boolean;
  status?: ClientStatus;
  error?: string;
}

/**
 * Result of stopping a Discord client
 */
export interface StopClientResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Status result for all clients
 */
export interface AllClientsStatus {
  activeClients: number;
  maxClients: number;
  clients: Record<string, ClientStatus>;
}

/**
 * Request body for starting a Discord client
 */
export interface StartClientRequest {
  userId: string;
  connectionId: string;
  token: string;
  serverId: string;
  channelId: string;
}

/**
 * Request body for stopping a Discord client
 */
export interface StopClientRequest {
  userId: string;
}

/**
 * Configuration for message handler
 */
export interface MessageHandlerConfig {
  userId: string;
  connectionId: string;
  monitoredChannelId: string;
  minDelay: number;
  maxDelay: number;
}

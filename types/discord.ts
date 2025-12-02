import { Document } from "mongoose";

/**
 * Discord Connection Interface
 * Represents a Discord account connected for signal monitoring
 */
export interface IDiscordConnection extends Document {
  userId: string;
  token: string; // Encrypted Discord user token
  serverId: string;
  serverName: string;
  channelId: string;
  channelName: string;
  status: "active" | "paused" | "error" | "banned" | "expired";
  autoExecute: boolean; // Automatically execute parsed signals
  requireConfirmation: boolean; // Require user confirmation before execution
  processedMessageCount: number; // Total messages processed
  executedTradeCount: number; // Total trades executed from this connection
  lastMessageAt?: Date; // Last message received timestamp
  lastError?: string; // Last error message
  errorCount: number; // Consecutive error count
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Discord Message Interface
 * Tracks messages received from Discord channels
 */
export interface IDiscordMessage extends Document {
  connectionId: string; // Reference to DiscordConnection
  userId: string;
  discordMessageId: string; // Discord's message ID
  channelId: string;
  channelName: string;
  content: string;
  authorId: string;
  authorUsername: string;
  timestamp: Date; // Discord message timestamp
  status: "pending" | "processing" | "parsed" | "executed" | "ignored" | "error";
  signalId?: string; // Reference to Signal if parsed
  tradeId?: string; // Reference to Trade if executed
  parseError?: string;
  executionError?: string;
  isSignal: boolean; // Whether message contains trading signal
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Discord Connection Form Data
 */
export interface DiscordConnectionFormData {
  token: string;
  serverId: string;
  serverName: string;
  channelId: string;
  channelName: string;
  autoExecute: boolean;
  requireConfirmation: boolean;
  tosAccepted: boolean;
}

/**
 * Discord Guild (Server) Information
 */
export interface DiscordGuild {
  id: string;
  name: string;
  icon?: string;
  owner: boolean;
  permissions: string;
}

/**
 * Discord Channel Information
 */
export interface DiscordChannel {
  id: string;
  type: number; // 0 = text, 2 = voice, etc.
  name: string;
  position: number;
  parentId?: string;
}

/**
 * Discord Token Validation Response
 */
export interface TokenValidationResult {
  valid: boolean;
  userId?: string;
  username?: string;
  discriminator?: string;
  error?: string;
}

/**
 * Connection Statistics
 */
export interface ConnectionStats {
  totalConnections: number;
  activeConnections: number;
  pausedConnections: number;
  errorConnections: number;
  totalMessagesProcessed: number;
  totalTradesExecuted: number;
}

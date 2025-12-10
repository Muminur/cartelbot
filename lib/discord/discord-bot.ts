/**
 * Discord Bot Manager
 *
 * Official Discord.js bot for monitoring channels and processing trading signals
 * Replaces Python selfbot with ToS-compliant bot implementation
 */

import { Client, GatewayIntentBits, Message, ChannelType, PermissionFlagsBits } from 'discord.js';
import mongoose from 'mongoose';
import { parseSignal } from '@/lib/parser';
import { executeSignalTrade } from '@/lib/binance/trade-executor';
import { discordEventEmitter } from './event-emitter';
import DiscordConnection from '@/lib/db/models/DiscordConnection';
import DiscordMessage from '@/lib/db/models/DiscordMessage';
import Signal from '@/lib/db/models/Signal';

let botClient: Client | null = null;
let isInitialized = false;

/**
 * Required bot permissions
 */
export const REQUIRED_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.ReadMessageHistory,
] as const;

/**
 * Initialize Discord bot client
 */
export async function initializeBot(): Promise<void> {
  if (isInitialized) {
    console.log('[Discord Bot] Already initialized');
    return;
  }

  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    console.error('[Discord Bot] DISCORD_BOT_TOKEN not configured in environment');
    throw new Error('Discord bot token not configured');
  }

  try {
    // Create Discord client with required intents
    botClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    // Bot ready event
    botClient.on('ready', () => {
      console.log(`[Discord Bot] Connected as ${botClient?.user?.tag}`);
      console.log(`[Discord Bot] Bot ID: ${botClient?.user?.id}`);
      console.log(`[Discord Bot] Monitoring ${botClient?.guilds.cache.size} servers`);
      isInitialized = true;
    });

    // Message received event
    botClient.on('messageCreate', async (message: Message) => {
      try {
        await handleMessage(message);
      } catch (error) {
        console.error('[Discord Bot] Error handling message:', error);
      }
    });

    // Error handling
    botClient.on('error', (error) => {
      console.error('[Discord Bot] Client error:', error);
    });

    // Disconnect event
    botClient.on('disconnect', () => {
      console.warn('[Discord Bot] Disconnected from Discord');
      isInitialized = false;
    });

    // Reconnecting event
    botClient.on('resume', () => {
      console.log('[Discord Bot] Reconnected to Discord');
      isInitialized = true;
    });

    // Login to Discord
    await botClient.login(botToken);
    console.log('[Discord Bot] Login successful');

  } catch (error) {
    console.error('[Discord Bot] Initialization failed:', error);
    isInitialized = false;
    throw error;
  }
}

/**
 * Handle incoming Discord message
 */
async function handleMessage(message: Message): Promise<void> {
  // Ignore bot's own messages
  if (message.author.bot) return;

  // Only process guild (server) messages
  if (message.channel.type !== ChannelType.GuildText) return;

  // Development logging
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Discord Bot] Message received: channel=${message.channelId}, author=${message.author.tag}`);
  }

  // Check if this channel is being monitored by any user
  const connection = await DiscordConnection.findOne({
    channelId: message.channelId,
    status: 'active',
    isActive: true,
  }).lean();

  if (!connection) {
    // Channel not monitored, ignore
    return;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Discord Bot] Message from monitored channel, processing for user ${connection.userId}`);
  }

  // Process the signal
  await processSignalMessage(message, connection);
}

/**
 * Process signal message from Discord
 */
async function processSignalMessage(
  message: Message,
  connection: any
): Promise<void> {
  const userId = String(connection.userId);
  const connectionId = String(connection._id);

  try {
    // Check for duplicate message
    const existing = await DiscordMessage.findOne({
      discordMessageId: message.id,
      channelId: message.channelId,
    });

    if (existing) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Discord Bot] Duplicate message ${message.id}, skipping`);
      }
      return;
    }

    // Create Discord message record
    const discordMessage = await DiscordMessage.create({
      userId: new mongoose.Types.ObjectId(userId),
      connectionId: new mongoose.Types.ObjectId(connectionId),
      discordMessageId: message.id,
      serverId: message.guildId,
      channelId: message.channelId,
      authorId: message.author.id,
      authorUsername: message.author.tag,
      content: message.content,
      timestamp: message.createdAt,
      processingStatus: 'pending',
      parseErrors: [],
    });

    // Emit: Message received event
    discordEventEmitter.emitSignalEvent({
      type: 'message_received',
      userId,
      connectionId,
      messageId: String(discordMessage._id),
      timestamp: new Date(),
      data: {
        message: `New message from ${message.author.tag}`,
        status: 'pending',
      },
    });

    // Parse signal
    discordEventEmitter.emitSignalEvent({
      type: 'parsing',
      userId,
      connectionId,
      messageId: String(discordMessage._id),
      timestamp: new Date(),
      data: {
        message: 'Parsing signal...',
        status: 'parsing',
      },
    });

    const parsed = parseSignal(message.content);

    if (process.env.NODE_ENV !== 'production') {
      console.log('[Discord Bot] Signal parsed:', {
        symbol: parsed.symbol,
        confidence: parsed.confidence,
        hasErrors: parsed.errors.length > 0,
      });
    }

    // Check confidence threshold (70%)
    if (parsed.confidence < 70) {
      discordMessage.processingStatus = 'ignored';
      discordMessage.parseErrors = parsed.errors;
      await discordMessage.save();

      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Discord Bot] Low confidence (${parsed.confidence}%), ignoring`);
      }
      return;
    }

    // Update message with parsed data
    discordMessage.parsedSignal = {
      symbol: parsed.symbol,
      entries: parsed.entries,
      targets: parsed.targets,
      stopLoss: parsed.stopLoss,
      confidence: parsed.confidence,
    };
    discordMessage.processingStatus = 'parsed';
    await discordMessage.save();

    // Create Signal document
    const signal = await Signal.create({
      userId: new mongoose.Types.ObjectId(userId),
      symbol: parsed.symbol,
      entries: parsed.entries,
      targets: parsed.targets,
      stopLoss: parsed.stopLoss,
      status: 'pending',
      source: 'discord',
      confidence: parsed.confidence,
      parsedData: parsed,
      rawText: message.content,
    });

    discordMessage.signalId = signal._id as mongoose.Types.ObjectId;
    await discordMessage.save();

    // Emit: Signal parsed event
    discordEventEmitter.emitSignalEvent({
      type: 'parsed',
      userId,
      connectionId,
      messageId: String(discordMessage._id),
      timestamp: new Date(),
      data: {
        symbol: parsed.symbol,
        confidence: parsed.confidence,
        signalId: String(signal._id),
        message: `Signal parsed: ${parsed.symbol} with ${parsed.confidence}% confidence`,
      },
    });

    // Auto-execute if enabled
    if (connection.autoExecute) {
      discordMessage.processingStatus = 'executed';
      await discordMessage.save();

      // Emit: Executing event
      discordEventEmitter.emitSignalEvent({
        type: 'executing',
        userId,
        connectionId,
        messageId: String(discordMessage._id),
        timestamp: new Date(),
        data: {
          symbol: parsed.symbol,
          signalId: String(signal._id),
          message: `Executing trade for ${parsed.symbol}...`,
        },
      });

      try {
        // Execute trade
        const trade = await executeSignalTrade(signal._id as mongoose.Types.ObjectId, userId);

        discordMessage.tradeId = trade._id as mongoose.Types.ObjectId;
        await discordMessage.save();

        // Emit: Completed event
        discordEventEmitter.emitSignalEvent({
          type: 'completed',
          userId,
          connectionId,
          messageId: String(discordMessage._id),
          timestamp: new Date(),
          data: {
            symbol: parsed.symbol,
            signalId: String(signal._id),
            tradeId: String(trade._id),
            message: `Trade executed successfully for ${parsed.symbol}`,
          },
        });

        // Update connection stats
        await DiscordConnection.findByIdAndUpdate(connectionId, {
          $inc: {
            processedMessageCount: 1,
            executedTradeCount: 1,
          },
          lastMessageAt: new Date(),
          lastProcessedAt: new Date(),
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        discordMessage.processingStatus = 'failed';
        discordMessage.executionError = errorMessage;
        await discordMessage.save();

        signal.status = 'failed';
        await signal.save();

        // Emit: Failed event
        discordEventEmitter.emitSignalEvent({
          type: 'failed',
          userId,
          connectionId,
          messageId: String(discordMessage._id),
          timestamp: new Date(),
          data: {
            symbol: parsed.symbol,
            signalId: String(signal._id),
            error: errorMessage,
            message: `Trade execution failed: ${errorMessage}`,
          },
        });

        // Update connection error count
        await DiscordConnection.findByIdAndUpdate(connectionId, {
          $inc: { errorCount: 1 },
          lastError: errorMessage,
          lastErrorAt: new Date(),
        });
      }
    } else {
      // Manual execution required
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Discord Bot] Auto-execute disabled, signal saved for manual review`);
      }

      await DiscordConnection.findByIdAndUpdate(connectionId, {
        $inc: { processedMessageCount: 1 },
        lastMessageAt: new Date(),
        lastProcessedAt: new Date(),
      });
    }

  } catch (error) {
    console.error('[Discord Bot] Error processing signal:', error);

    // Update connection error count
    await DiscordConnection.findByIdAndUpdate(connectionId, {
      $inc: { errorCount: 1 },
      lastError: error instanceof Error ? error.message : 'Unknown error',
      lastErrorAt: new Date(),
    });
  }
}

/**
 * Get bot status
 */
export function getBotStatus() {
  if (!botClient) {
    return {
      isReady: false,
      user: null,
      guilds: 0,
      uptime: 0,
    };
  }

  return {
    isReady: botClient.isReady(),
    user: botClient.user ? {
      id: botClient.user.id,
      tag: botClient.user.tag,
      username: botClient.user.username,
    } : null,
    guilds: botClient.guilds.cache.size,
    uptime: botClient.uptime || 0,
  };
}

/**
 * Get bot client instance
 */
export function getBotClient(): Client | null {
  return botClient;
}

/**
 * Shutdown bot gracefully
 */
export async function shutdownBot(): Promise<void> {
  if (botClient) {
    console.log('[Discord Bot] Shutting down...');
    await botClient.destroy();
    botClient = null;
    isInitialized = false;
    console.log('[Discord Bot] Shutdown complete');
  }
}

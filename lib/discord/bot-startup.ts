/**
 * Discord Bot Startup Handler
 *
 * Initializes Discord bot when Next.js server starts
 * Ensures single bot instance across application lifecycle
 */

import { initializeBot, shutdownBot } from './discord-bot';
import { connectDatabase } from '@/lib/db/mongodb';

let isStarted = false;

/**
 * Start Discord bot
 */
export async function startDiscordBot(): Promise<void> {
  if (isStarted) {
    console.log('[Bot Startup] Already started');
    return;
  }

  try {
    // Ensure MongoDB is connected
    await connectDatabase();
    console.log('[Bot Startup] Database connected');

    // Initialize Discord bot
    await initializeBot();
    console.log('[Bot Startup] Discord bot initialized successfully');

    isStarted = true;

    // Handle process termination
    process.on('SIGINT', async () => {
      console.log('[Bot Startup] Received SIGINT, shutting down...');
      await shutdownBot();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('[Bot Startup] Received SIGTERM, shutting down...');
      await shutdownBot();
      process.exit(0);
    });

  } catch (error) {
    console.error('[Bot Startup] Failed to start Discord bot:', error);
    isStarted = false;
    throw error;
  }
}

/**
 * Check if bot is running
 */
export function isBotRunning(): boolean {
  return isStarted;
}

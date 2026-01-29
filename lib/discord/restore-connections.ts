/**
 * Restore active Discord connections from database on server startup
 *
 * This module is Node.js-only and should never be imported in Edge runtime.
 * It uses Node.js crypto via the encryption module.
 */

import { connectDB } from '@/lib/db/connection';
import { DiscordConnection } from '@/lib/db/models/DiscordConnection';
import { decrypt } from '@/lib/encryption';
import type { DiscordClientManager } from './client-manager';

export async function restoreActiveConnections(manager: DiscordClientManager): Promise<void> {
  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Instrumentation] Starting Discord connection restoration...');
    }

    // Ensure database is connected
    await connectDB();

    // Query active connections (must explicitly select discordUserToken since it's excluded by default)
    // Include 'error' status to retry connections that failed on previous server startup
    const activeConnections = await DiscordConnection.find({
      isActive: true,
      status: { $in: ['active', 'error'] },
    }).select('+discordUserToken');

    if (!activeConnections || activeConnections.length === 0) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[Instrumentation] No active Discord connections to restore');
      }
      return;
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[Instrumentation] Found ${activeConnections.length} active Discord connection(s) to restore`
      );
    }

    // Restore each connection
    let successCount = 0;
    let failureCount = 0;

    for (const connection of activeConnections) {
      try {
        // Decrypt token
        const token = decrypt(connection.discordUserToken);

        // Start Discord client
        const result = await manager.startClient(
          connection.userId.toString(),
          connection._id.toString(),
          token,
          connection.serverId,
          connection.channelId
        );

        if (result.success) {
          successCount++;
          // Reset error state on successful restore
          connection.status = 'active';
          connection.lastError = null;
          connection.errorCount = 0;
          await connection.save();

          if (process.env.NODE_ENV !== 'production') {
            console.log(
              `[Instrumentation] ✅ Restored Discord connection for user ${connection.userId} ` +
                `(${connection.discordUsername})`
            );
          }
        } else {
          failureCount++;
          console.error(
            `[Instrumentation] ❌ Failed to restore Discord connection for user ${connection.userId}: ` +
              `${result.error}`
          );

          // Update connection status in database to reflect failure
          try {
            connection.status = 'error';
            connection.lastError = result.error || 'Failed to restore connection';
            connection.lastErrorAt = new Date();
            connection.errorCount = (connection.errorCount || 0) + 1;
            await connection.save();
          } catch (dbError) {
            console.error(
              `[Instrumentation] Failed to update connection status for user ${connection.userId}:`,
              dbError
            );
          }
        }
      } catch (error) {
        failureCount++;
        console.error(
          `[Instrumentation] ❌ Error restoring Discord connection for user ${connection.userId}:`,
          error instanceof Error ? error.message : 'Unknown error'
        );

        // Update connection status in database
        try {
          connection.status = 'error';
          connection.lastError =
            error instanceof Error ? error.message : 'Unknown error during restoration';
          connection.lastErrorAt = new Date();
          connection.errorCount = (connection.errorCount || 0) + 1;
          await connection.save();
        } catch (dbError) {
          console.error(
            `[Instrumentation] Failed to update connection status for user ${connection.userId}:`,
            dbError
          );
        }
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[Instrumentation] Discord connection restoration complete: ` +
          `${successCount} succeeded, ${failureCount} failed`
      );
    }
  } catch (error) {
    console.error(
      '[Instrumentation] Fatal error during Discord connection restoration:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    // Don't throw - allow server to continue even if restoration fails completely
  }
}

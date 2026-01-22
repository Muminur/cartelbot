/**
 * Restore active Discord connections from database on server startup
 *
 * This function:
 * 1. Queries the database for active Discord connections
 * 2. Decrypts stored tokens
 * 3. Restarts each Discord client
 * 4. Handles errors gracefully (one failed connection doesn't crash the server)
 *
 * Called 5 seconds after server startup to allow MongoDB to connect first.
 */
async function restoreActiveConnections(manager: any): Promise<void> {
  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Instrumentation] Starting Discord connection restoration...');
    }

    // Import database utilities
    const { connectDB } = await import('./lib/db/connection');
    const { DiscordConnection } = await import('./lib/db/models/DiscordConnection');
    const { decrypt } = await import('./lib/encryption');

    // Ensure database is connected
    await connectDB();

    // Query active connections (must explicitly select discordUserToken since it's excluded by default)
    const activeConnections = await DiscordConnection.find({
      isActive: true,
      status: 'active',
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

export async function register() {
  // Skip Sentry during build to avoid Next.js 16 prerendering bugs
  // Check if we're in build mode (no runtime defined yet)
  if (!process.env.NEXT_RUNTIME) {
    return;
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      await import('./sentry.server.config');
    } catch (error) {
      console.error('Failed to load Sentry server config:', error);
      // App continues to run even if Sentry fails
    }

    // Initialize global Discord client manager
    try {
      const { getDiscordClientManager } = await import('./lib/discord/client-manager');
      const manager = getDiscordClientManager();
      if (process.env.NODE_ENV !== 'production') {
        console.log('[Instrumentation] Discord client manager initialized');
      }

      // Restore active Discord connections after MongoDB connects (5 second delay)
      setTimeout(() => {
        restoreActiveConnections(manager).catch((error) => {
          console.error('[Instrumentation] Failed to restore Discord connections:', error);
          // App continues to run even if restore fails
        });
      }, 5000);
    } catch (error) {
      console.error('Failed to initialize Discord client manager:', error);
      // App continues to run even if Discord manager fails
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    try {
      await import('./sentry.edge.config');
    } catch (error) {
      console.error('Failed to load Sentry edge config:', error);
      // App continues to run even if Sentry fails
    }
  }
}

export const onRequestError = async (
  err: { digest: string } & Error,
  request: {
    path: string;
    method: string;
    headers: { [key: string]: string };
  }
) => {
  try {
    const Sentry = await import('@sentry/nextjs');

    Sentry.captureException(err, {
      contexts: {
        request: {
          method: request.method,
          url: request.path,
        },
      },
    });
  } catch (error) {
    console.error('Failed to report error to Sentry:', error);
    console.error('Original error:', err);
    // App continues to run even if Sentry fails
  }
};

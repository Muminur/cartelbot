export async function register() {
  // Skip during build to avoid Next.js 16 prerendering bugs
  if (!process.env.NEXT_RUNTIME) {
    return;
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Sentry for Node.js
    try {
      await import('./sentry.server.config');
    } catch (error) {
      console.error('Failed to load Sentry server config:', error);
    }

    // Initialize Discord client manager and restore connections
    try {
      const { getDiscordClientManager } = await import('./lib/discord/client-manager');
      const manager = getDiscordClientManager();

      if (process.env.NODE_ENV !== 'production') {
        console.log('[Instrumentation] Discord client manager initialized');
      }

      // Restore active Discord connections after MongoDB connects (5 second delay)
      // Dynamic import ensures this Node.js-only module isn't analyzed for Edge
      setTimeout(async () => {
        try {
          const { restoreActiveConnections } = await import('./lib/discord/restore-connections');
          await restoreActiveConnections(manager);
        } catch (error) {
          console.error('[Instrumentation] Failed to restore Discord connections:', error);
        }
      }, 5000);
    } catch (error) {
      console.error('Failed to initialize Discord client manager:', error);
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    try {
      await import('./sentry.edge.config');
    } catch (error) {
      console.error('Failed to load Sentry edge config:', error);
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
  // Only report errors in Node.js runtime
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

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
  }
};

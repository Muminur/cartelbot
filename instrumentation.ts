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

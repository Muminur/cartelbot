import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.SENTRY_DSN;

// Skip Sentry initialization during build to avoid Next.js 16 Turbopack prerendering bugs
if (typeof window === 'undefined' && !SENTRY_DSN) {
  console.log('[Sentry] Skipping initialization (no DSN provided)');
} else {
  Sentry.init({
  dsn: SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  debug: false,
  beforeSend(event) {
    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
    }
    if (event.contexts?.runtime?.name === 'node') {
      if (event.extra) {
        delete event.extra['env'];
      }
    }
    return event;
  },
  ignoreErrors: [
    'ECONNRESET',
    'ENOTFOUND',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'MongoNetworkError',
  ],
  });
}

import { NextResponse } from "next/server";

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, TokenBucket>();
const CLEANUP_INTERVAL = 300000;
const BUCKET_EXPIRY_TIME = 3600000;

let cleanupTimer: NodeJS.Timeout | null = null;

function startCleanup() {
  if (cleanupTimer) return;

  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets.entries()) {
      if (now - bucket.lastRefill > BUCKET_EXPIRY_TIME) {
        buckets.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);

  // Prevent timer from blocking Node.js exit
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }
}

export function stopCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

interface RateLimitConfig {
  maxTokens: number;
  refillRate: number;
  refillInterval: number;
}

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  auth: { maxTokens: 5, refillRate: 1, refillInterval: 180000 },
  trading: { maxTokens: 10, refillRate: 1, refillInterval: 60000 },
  api: { maxTokens: 100, refillRate: 10, refillInterval: 60000 },
  admin: { maxTokens: 50, refillRate: 5, refillInterval: 60000 },
};

function getOrCreateBucket(key: string, config: RateLimitConfig): TokenBucket {
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: config.maxTokens, lastRefill: Date.now() };
    buckets.set(key, bucket);
    startCleanup();
  }
  return bucket;
}

function refillBucket(bucket: TokenBucket, config: RateLimitConfig): void {
  const now = Date.now();
  const timePassed = now - bucket.lastRefill;
  const intervalsElapsed = Math.floor(timePassed / config.refillInterval);

  if (intervalsElapsed > 0) {
    bucket.tokens = Math.min(
      config.maxTokens,
      bucket.tokens + intervalsElapsed * config.refillRate
    );
    bucket.lastRefill = now;
  }
}

export async function rateLimit(
  identifier: string,
  limitType: keyof typeof RATE_LIMITS = "api"
): Promise<NextResponse | null> {
  const config = RATE_LIMITS[limitType];
  const key = `${limitType}:${identifier}`;
  const bucket = getOrCreateBucket(key, config);

  refillBucket(bucket, config);

  if (bucket.tokens < 1) {
    const retryAfter = Math.ceil(config.refillInterval / 1000);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests. Please try again later.",
          statusCode: 429,
          retryAfter,
        },
      },
      {
        status: 429,
        headers: {
          "Retry-After": retryAfter.toString(),
          "X-RateLimit-Limit": config.maxTokens.toString(),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  bucket.tokens -= 1;
  return null;
}

export function getRateLimitHeaders(
  identifier: string,
  limitType: keyof typeof RATE_LIMITS = "api"
): Record<string, string> {
  const config = RATE_LIMITS[limitType];
  const key = `${limitType}:${identifier}`;
  const bucket = buckets.get(key);

  if (!bucket) {
    return {
      "X-RateLimit-Limit": config.maxTokens.toString(),
      "X-RateLimit-Remaining": config.maxTokens.toString(),
    };
  }

  refillBucket(bucket, config);

  return {
    "X-RateLimit-Limit": config.maxTokens.toString(),
    "X-RateLimit-Remaining": Math.max(0, Math.floor(bucket.tokens)).toString(),
  };
}

export function clearRateLimits(identifier?: string, limitType?: keyof typeof RATE_LIMITS): void {
  if (identifier && limitType) {
    buckets.delete(`${limitType}:${identifier}`);
  } else if (identifier) {
    for (const type of Object.keys(RATE_LIMITS)) {
      buckets.delete(`${type}:${identifier}`);
    }
  } else {
    buckets.clear();
  }
}

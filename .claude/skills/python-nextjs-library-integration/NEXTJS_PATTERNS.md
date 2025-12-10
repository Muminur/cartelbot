# Next.js Patterns for Python Integration

This document covers Next.js-specific patterns and best practices when integrating with Python services.

## API Routes Architecture

### Basic Route Handler (App Router)

**File**: `app/api/signals/parse/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();

    // Call Python service
    const response = await fetch(`${process.env.PYTHON_SERVICE_URL}/api/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { error: error.message || 'Python service error' },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error('API route error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### With Timeout & Retry

```typescript
import { NextRequest, NextResponse } from 'next/server';

const PYTHON_SERVICE_TIMEOUT = 10000; // 10 seconds
const MAX_RETRIES = 3;

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries: number = MAX_RETRIES
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetchWithTimeout(url, options, PYTHON_SERVICE_TIMEOUT);
    } catch (error) {
      if (i === retries - 1) throw error;
      if (error.name === 'AbortError') {
        // Exponential backoff: 1s, 2s, 4s
        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, i)));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();

    const response = await fetchWithRetry(
      `${process.env.PYTHON_SERVICE_URL}/api/parse`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }
    );

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    if (error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Python service timeout' },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### Authentication & Authorization

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(req: NextRequest) {
  // Check authentication
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const data = await req.json();

    // Include user ID in request to Python service
    const response = await fetch(
      `${process.env.PYTHON_SERVICE_URL}/api/protected`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
          ...data,
          userId: session.user.id,
        }),
      }
    );

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

---

## Environment Configuration

### .env.local

```bash
# Python service connection
PYTHON_SERVICE_URL=http://localhost:8000
PYTHON_SERVICE_TIMEOUT=10000

# Shared secrets (must match Python .env)
JWT_SECRET=your-jwt-secret-min-32-chars
WEBHOOK_SECRET=your-webhook-secret-min-32-chars
ENCRYPTION_KEY=your-64-char-hex-encryption-key

# Discord service (optional)
DISCORD_PYTHON_SERVICE_URL=http://localhost:8000
DISCORD_WEBHOOK_SECRET=your-discord-webhook-secret
```

### Type-Safe Environment Variables

**File**: `lib/env.ts` (CartelBot pattern)

```typescript
import { z } from 'zod';

const envSchema = z.object({
  // Python service
  PYTHON_SERVICE_URL: z.string().url(),
  PYTHON_SERVICE_TIMEOUT: z.string().regex(/^\d+$/).transform(Number).default('10000'),

  // Security
  JWT_SECRET: z.string().min(32),
  WEBHOOK_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().length(64), // 32 bytes hex

  // Optional
  DISCORD_PYTHON_SERVICE_URL: z.string().url().optional(),
  DISCORD_WEBHOOK_SECRET: z.string().min(32).optional(),
});

// Validate and export
export const env = envSchema.parse({
  PYTHON_SERVICE_URL: process.env.PYTHON_SERVICE_URL,
  PYTHON_SERVICE_TIMEOUT: process.env.PYTHON_SERVICE_TIMEOUT,
  JWT_SECRET: process.env.JWT_SECRET,
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  DISCORD_PYTHON_SERVICE_URL: process.env.DISCORD_PYTHON_SERVICE_URL,
  DISCORD_WEBHOOK_SECRET: process.env.DISCORD_WEBHOOK_SECRET,
});

// Usage in API routes
import { env } from '@/lib/env';

const response = await fetch(`${env.PYTHON_SERVICE_URL}/api/data`);
```

---

## Client-Side Integration

### Python Service Client Class

**File**: `lib/python-services/client.ts`

```typescript
import { z } from 'zod';

export class PythonServiceClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl?: string, timeout?: number) {
    this.baseUrl = baseUrl || process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL || 'http://localhost:8000';
    this.timeout = timeout || 10000;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(error.message || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Python service timeout');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async parseSignal<T>(data: unknown): Promise<T> {
    return this.request<T>('/api/signals/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.request<{ status: string }>('/health');
      return true;
    } catch {
      return false;
    }
  }
}

// Export singleton
export const pythonClient = new PythonServiceClient();
```

### React Hook for Python Service

**File**: `hooks/usePythonService.ts`

```typescript
import { useState } from 'react';
import { pythonClient } from '@/lib/python-services/client';

interface UsePythonServiceOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

export function usePythonService<TInput, TOutput>(
  serviceFn: (input: TInput) => Promise<TOutput>,
  options?: UsePythonServiceOptions<TOutput>
) {
  const [data, setData] = useState<TOutput | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);

  const execute = async (input: TInput) => {
    setLoading(true);
    setError(null);

    try {
      const result = await serviceFn(input);
      setData(result);
      options?.onSuccess?.(result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      options?.onError?.(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return { data, error, loading, execute };
}

// Usage in component
function SignalForm() {
  const { data, error, loading, execute } = usePythonService(
    (signal: SignalData) => pythonClient.parseSignal(signal),
    {
      onSuccess: (result) => toast.success('Signal parsed'),
      onError: (error) => toast.error(error.message),
    }
  );

  const handleSubmit = async (formData: SignalData) => {
    await execute(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      <button type="submit" disabled={loading}>
        {loading ? 'Parsing...' : 'Parse Signal'}
      </button>
      {error && <div className="error">{error.message}</div>}
    </form>
  );
}
```

---

## Type Safety

### Shared Type Definitions

**Python** (Pydantic):
```python
from pydantic import BaseModel

class TradeSignal(BaseModel):
    symbol: str
    entry_price: float
    targets: list[float]
    stop_loss: float | None = None
```

**TypeScript** (Zod - matching schema):
```typescript
import { z } from 'zod';

export const TradeSignalSchema = z.object({
  symbol: z.string(),
  entry_price: z.number(),
  targets: z.array(z.number()),
  stop_loss: z.number().nullable().optional(),
});

export type TradeSignal = z.infer<typeof TradeSignalSchema>;

// Runtime validation
export function validateTradeSignal(data: unknown): TradeSignal {
  return TradeSignalSchema.parse(data);
}
```

### Type Generation from Python

**Manual approach** (types/python-services.ts):
```typescript
// Generated from Python Pydantic models
export interface TradeSignal {
  symbol: string;
  entry_price: number;
  targets: number[];
  stop_loss?: number | null;
}

export interface ParseResponse {
  symbol: string;
  status: 'parsed' | 'failed';
  targets_count: number;
  error?: string;
}
```

**Automated approach** (using script):
```bash
# Run Python script to generate TypeScript types
python scripts/generate-types.py > types/python-generated.ts
```

---

## Server-Sent Events (SSE)

### Next.js API Route (SSE Server)

**File**: `app/api/python-stream/route.ts`

```typescript
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Connect to Python service SSE endpoint
        const response = await fetch(
          `${process.env.PYTHON_SERVICE_URL}/api/stream`,
          {
            headers: { Accept: 'text/event-stream' },
          }
        );

        if (!response.body) {
          throw new Error('No response body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            controller.close();
            break;
          }

          const chunk = decoder.decode(value);
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (error) {
        console.error('SSE stream error:', error);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
```

### Client Hook (SSE Consumer)

**File**: `hooks/usePythonSSE.ts`

```typescript
import { useEffect, useState, useRef } from 'react';

interface SSEOptions {
  onMessage?: (data: any) => void;
  onError?: (error: Event) => void;
  onOpen?: () => void;
}

export function usePythonSSE<T>(endpoint: string, options?: SSEOptions) {
  const [data, setData] = useState<T | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const eventSource = new EventSource(endpoint);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      options?.onOpen?.();
    };

    eventSource.onmessage = (event) => {
      const parsed = JSON.parse(event.data) as T;
      setData(parsed);
      options?.onMessage?.(parsed);
    };

    eventSource.onerror = (error) => {
      setIsConnected(false);
      options?.onError?.(error);
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [endpoint]);

  return { data, isConnected };
}

// Usage
function LivePriceDisplay() {
  const { data, isConnected } = usePythonSSE<{ symbol: string; price: number }>(
    '/api/python-stream',
    {
      onMessage: (data) => console.log('Price update:', data),
      onError: (error) => console.error('SSE error:', error),
    }
  );

  return (
    <div>
      <span className={isConnected ? 'text-green-500' : 'text-red-500'}>
        {isConnected ? '● Connected' : '○ Disconnected'}
      </span>
      {data && <div>{data.symbol}: ${data.price}</div>}
    </div>
  );
}
```

---

## WebSocket Integration

### Next.js WebSocket Proxy

**File**: `app/api/python-ws/route.ts`

```typescript
export async function GET(req: NextRequest) {
  const upgradeHeader = req.headers.get('upgrade');

  if (upgradeHeader !== 'websocket') {
    return new Response('Expected Upgrade: websocket', { status: 426 });
  }

  // Note: Next.js doesn't natively support WebSocket upgrades in App Router
  // Use a separate WebSocket server or external service

  return new Response('WebSocket upgrade not supported in this route', {
    status: 501,
  });
}
```

**Alternative**: Use client-side WebSocket directly to Python service

```typescript
// hooks/usePythonWebSocket.ts
import { useEffect, useRef, useState } from 'react';

export function usePythonWebSocket(url: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setIsConnected(true);
    ws.onmessage = (event) => setLastMessage(JSON.parse(event.data));
    ws.onerror = (error) => console.error('WebSocket error:', error);
    ws.onclose = () => setIsConnected(false);

    return () => {
      ws.close();
    };
  }, [url]);

  const send = (data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  };

  return { isConnected, lastMessage, send };
}

// Usage
function LiveTrading() {
  const { isConnected, lastMessage, send } = usePythonWebSocket(
    'ws://localhost:8000/ws/signals'
  );

  const subscribe = () => {
    send({ action: 'subscribe', symbol: 'BTCUSDT' });
  };

  return (
    <div>
      <button onClick={subscribe} disabled={!isConnected}>
        Subscribe to Signals
      </button>
      {lastMessage && <pre>{JSON.stringify(lastMessage, null, 2)}</pre>}
    </div>
  );
}
```

---

## Error Handling

### Centralized Error Handler

**File**: `lib/python-services/errors.ts`

```typescript
export class PythonServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = 'PythonServiceError';
  }
}

export function handlePythonError(error: unknown): never {
  if (error instanceof PythonServiceError) {
    throw error;
  }

  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      throw new PythonServiceError('Python service timeout', 504, 'TIMEOUT');
    }

    if (error.message.includes('ECONNREFUSED')) {
      throw new PythonServiceError(
        'Python service unavailable',
        503,
        'SERVICE_UNAVAILABLE'
      );
    }
  }

  throw new PythonServiceError('Unknown error', 500, 'UNKNOWN');
}
```

### API Route Error Response

```typescript
export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const result = await pythonClient.parseSignal(data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PythonServiceError) {
      return NextResponse.json(
        {
          error: {
            message: error.message,
            code: error.code,
            statusCode: error.statusCode,
          },
        },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
```

---

## Caching Strategies

### API Route Cache

```typescript
import { NextRequest, NextResponse } from 'next/server';

const cache = new Map<string, { data: any; expiry: number }>();

function getCachedData(key: string): any | null {
  const cached = cache.get(key);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

function setCachedData(key: string, data: any, ttlSeconds: number): void {
  cache.set(key, {
    data,
    expiry: Date.now() + ttlSeconds * 1000,
  });
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol');
  const cacheKey = `price:${symbol}`;

  // Check cache
  const cached = getCachedData(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'X-Cache': 'HIT' },
    });
  }

  // Fetch from Python service
  const response = await fetch(
    `${process.env.PYTHON_SERVICE_URL}/api/price/${symbol}`
  );
  const data = await response.json();

  // Cache for 5 seconds
  setCachedData(cacheKey, data, 5);

  return NextResponse.json(data, {
    headers: { 'X-Cache': 'MISS' },
  });
}
```

### Next.js Route Segment Config

```typescript
// app/api/python-data/route.ts

// Revalidate every 60 seconds
export const revalidate = 60;

// Force dynamic rendering (no static optimization)
export const dynamic = 'force-dynamic';

// Set runtime to nodejs (not edge)
export const runtime = 'nodejs';

export async function GET() {
  const data = await fetchPythonService();
  return NextResponse.json(data);
}
```

---

## Best Practices

### 1. Always Set Timeouts

```typescript
const TIMEOUT = 10000;

const controller = new AbortController();
setTimeout(() => controller.abort(), TIMEOUT);

await fetch(url, { signal: controller.signal });
```

### 2. Validate Python Responses

```typescript
import { z } from 'zod';

const ResponseSchema = z.object({
  status: z.enum(['success', 'error']),
  data: z.any(),
});

const response = await fetch(pythonServiceUrl);
const json = await response.json();
const validated = ResponseSchema.parse(json); // Throws if invalid
```

### 3. Health Check Before Critical Operations

```typescript
async function ensurePythonServiceAvailable() {
  const isHealthy = await pythonClient.healthCheck();

  if (!isHealthy) {
    throw new Error('Python service unavailable');
  }
}

export async function POST(req: NextRequest) {
  await ensurePythonServiceAvailable();

  // Proceed with operation
  const result = await pythonClient.parseSignal(data);
  return NextResponse.json(result);
}
```

### 4. Graceful Degradation

```typescript
export async function GET() {
  try {
    const data = await pythonClient.getData();
    return NextResponse.json(data);
  } catch (error) {
    // Fallback to cached data or default values
    return NextResponse.json({
      data: null,
      error: 'Service temporarily unavailable',
      fallback: true,
    });
  }
}
```

### 5. Production Logging Guards

```typescript
if (process.env.NODE_ENV === 'development') {
  console.log('Python request:', data);
}

// OR use conditional logging
const log = process.env.NODE_ENV === 'development' ? console.log : () => {};
log('Debug info');
```

---

## CartelBot Patterns

### Discord Webhook Handler

**File**: `app/api/discord/webhook/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

function verifyWebhookSignature(payload: string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', process.env.DISCORD_WEBHOOK_SECRET!)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-webhook-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
  }

  const payload = await req.text();

  if (!verifyWebhookSignature(payload, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const data = JSON.parse(payload);

  // Process Discord message
  // ... implementation

  return NextResponse.json({ status: 'received' });
}
```

---

## Performance Optimization

### Connection Pooling

```typescript
// lib/python-services/http-client.ts
class HTTPClient {
  private static instance: HTTPClient;
  private agent: http.Agent;

  private constructor() {
    this.agent = new http.Agent({
      keepAlive: true,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: 60000,
    });
  }

  static getInstance(): HTTPClient {
    if (!HTTPClient.instance) {
      HTTPClient.instance = new HTTPClient();
    }
    return HTTPClient.instance;
  }

  async fetch(url: string, options: RequestInit = {}) {
    return fetch(url, {
      ...options,
      // @ts-ignore
      agent: this.agent,
    });
  }
}

export const httpClient = HTTPClient.getInstance();
```

### Parallel Requests

```typescript
// Fetch multiple endpoints in parallel
const [prices, signals, trades] = await Promise.all([
  pythonClient.getPrices(),
  pythonClient.getSignals(),
  pythonClient.getTrades(),
]);
```

---

## Deployment Considerations

### Environment Variables in Production

```bash
# .env.production
PYTHON_SERVICE_URL=https://python-service.cartelbot.cc
PYTHON_SERVICE_TIMEOUT=15000
```

### Docker Compose Integration

```yaml
version: '3.8'

services:
  nextjs:
    build: .
    environment:
      - PYTHON_SERVICE_URL=http://python-service:8000
    depends_on:
      - python-service

  python-service:
    build: ./services/discord-selfbot
    ports:
      - "8000:8000"
```

### Health Monitoring

```typescript
// app/api/health/route.ts
export async function GET() {
  const pythonHealthy = await pythonClient.healthCheck();

  return NextResponse.json({
    status: pythonHealthy ? 'healthy' : 'degraded',
    services: {
      python: pythonHealthy ? 'up' : 'down',
    },
  });
}
```

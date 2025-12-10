---
name: python-nextjs-library-integration
description: Create, modify, and integrate Python libraries with Next.js applications. Handle type bindings, API adapters, encryption, async patterns, and protocol buffers. Use when building Python services for Next.js frontends, wrapping Python libraries for TypeScript, implementing Python-JavaScript interoperability, or creating FastAPI/Flask services consumed by Next.js. Optimize for security, performance, and type safety.
---

# Python ↔ Next.js Library Integration

## Overview

This skill provides comprehensive expertise for integrating Python libraries and services into Next.js applications. It covers the complete integration lifecycle from initial architecture design to production deployment.

**Core capabilities:**

1. **Creating Python services** that Next.js can consume (FastAPI, Flask, Django)
2. **Type-safe bindings** between Python and TypeScript
3. **API adapters** for protocol translation and data serialization
4. **Security patterns** (encryption, authentication, token management, sandboxing)
5. **Real-time communication** (WebSockets, Server-Sent Events, polling)
6. **Testing strategies** across language boundaries
7. **Performance optimization** (caching, connection pooling, async patterns)
8. **Deployment patterns** (Docker, process management, health checks)

## Quick Start Patterns

### Pattern 1: FastAPI Service with Next.js Client (Recommended)

**Python Service** (FastAPI):
```python
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
import asyncio

app = FastAPI(title="Trading Signal Parser")

# CORS for Next.js dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SignalData(BaseModel):
    symbol: str = Field(..., pattern=r'^[A-Z]+$')
    entry_price: float = Field(..., gt=0)
    targets: list[float] = Field(..., min_items=1, max_items=5)
    stop_loss: Optional[float] = None

class ParseResponse(BaseModel):
    symbol: str
    status: str
    targets_count: int
    estimated_risk: Optional[float] = None

@app.post("/api/parse-signal", response_model=ParseResponse)
async def parse_signal(signal: SignalData):
    """Parse trading signal with validation."""

    # Validate targets are above entry
    if any(t <= signal.entry_price for t in signal.targets):
        raise HTTPException(400, "Targets must be above entry price")

    # Calculate risk if stop loss provided
    risk = None
    if signal.stop_loss:
        risk = ((signal.entry_price - signal.stop_loss) / signal.entry_price) * 100

    return ParseResponse(
        symbol=signal.symbol,
        status="parsed",
        targets_count=len(signal.targets),
        estimated_risk=risk
    )

@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring."""
    return {"status": "healthy", "service": "signal-parser"}
```

**Next.js Client** (TypeScript):
```typescript
// lib/python-services/signal-parser.ts
import { z } from 'zod';

// Schema matches Python Pydantic model
const SignalDataSchema = z.object({
  symbol: z.string().regex(/^[A-Z]+$/),
  entry_price: z.number().positive(),
  targets: z.array(z.number()).min(1).max(5),
  stop_loss: z.number().optional(),
});

const ParseResponseSchema = z.object({
  symbol: z.string(),
  status: z.string(),
  targets_count: z.number(),
  estimated_risk: z.number().nullable(),
});

export type SignalData = z.infer<typeof SignalDataSchema>;
export type ParseResponse = z.infer<typeof ParseResponseSchema>;

class SignalParserClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl = 'http://localhost:8000', timeout = 10000) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  async parseSignal(data: SignalData): Promise<ParseResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/api/parse-signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Parse failed');
      }

      const result = await response.json();
      return ParseResponseSchema.parse(result);
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Python service timeout');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const signalParser = new SignalParserClient(
  process.env.PYTHON_SERVICE_URL
);
```

**Next.js API Route**:
```typescript
// app/api/signals/parse/route.ts
import { NextRequest } from 'next/server';
import { signalParser } from '@/lib/python-services/signal-parser';

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const result = await signalParser.parseSignal(data);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
```

### Pattern 2: WebSocket Real-time Communication

**Python Service** (WebSocket with discord.py-self):
```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing import Set
import asyncio
import json

app = FastAPI()

class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    async def broadcast(self, message: dict):
        """Send message to all connected clients."""
        disconnected = set()
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                disconnected.add(connection)

        # Clean up disconnected clients
        self.active_connections -= disconnected

manager = ConnectionManager()

@app.websocket("/ws/signals")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive
            data = await websocket.receive_text()
            # Echo back or process
            await websocket.send_json({"status": "received", "data": data})
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Example: Broadcasting from another part of your app
async def broadcast_signal(signal_data: dict):
    """Called when new signal detected."""
    await manager.broadcast({
        "type": "new_signal",
        "data": signal_data,
        "timestamp": datetime.now().isoformat()
    })
```

**Next.js Client** (WebSocket with reconnection):
```typescript
// hooks/usePythonWebSocket.ts
import { useEffect, useRef, useState } from 'react';

interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: string;
}

export function usePythonWebSocket(url: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;

    function connect() {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        reconnectAttempts = 0;
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data) as WebSocketMessage;
        setLastMessage(message);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        wsRef.current = null;

        // Exponential backoff reconnection
        if (reconnectAttempts < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts++;
            connect();
          }, delay);
        }
      };

      wsRef.current = ws;
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [url]);

  return { isConnected, lastMessage };
}
```

### Pattern 3: Server-Sent Events (SSE) for One-way Streaming

**Python Service** (SSE):
```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
import asyncio
import json

app = FastAPI()

async def event_generator():
    """Generate server-sent events."""
    try:
        while True:
            # Simulate real-time data
            data = {
                "type": "update",
                "timestamp": datetime.now().isoformat(),
                "value": random.random()
            }
            yield f"data: {json.dumps(data)}\n\n"
            await asyncio.sleep(1)
    except asyncio.CancelledError:
        # Client disconnected
        pass

@app.get("/api/stream")
async def stream_events():
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )
```

**Next.js Client** (SSE):
```typescript
// hooks/usePythonSSE.ts
import { useEffect, useState } from 'react';

export function usePythonSSE<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      const parsed = JSON.parse(event.data) as T;
      setData(parsed);
    };

    eventSource.onerror = () => {
      setIsConnected(false);
    };

    return () => {
      eventSource.close();
    };
  }, [url]);

  return { data, isConnected };
}
```

### Pattern 4: Subprocess Execution (Lightweight, No Service)

Use for simple Python operations without maintaining a separate service:

```typescript
// lib/python-subprocess.ts
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function executePythonScript(
  scriptPath: string,
  args: string[] = [],
  timeout = 30000
): Promise<string> {
  const command = `python "${scriptPath}" ${args.join(' ')}`;

  try {
    const { stdout, stderr } = await execAsync(command, { timeout });

    if (stderr && !stderr.includes('Warning')) {
      throw new Error(`Python error: ${stderr}`);
    }

    return stdout.trim();
  } catch (error) {
    if (error.killed) {
      throw new Error('Python script timeout');
    }
    throw error;
  }
}

// Usage in API route
export async function POST(req: Request) {
  const { inputData } = await req.json();

  const result = await executePythonScript(
    'scripts/process-signal.py',
    [JSON.stringify(inputData)]
  );

  return Response.json({ result: JSON.parse(result) });
}
```

## Core Integration Patterns

### 1. Type Safety & Schema Validation

**Problem**: Python dictionaries don't map cleanly to TypeScript types, leading to runtime errors.

**Solution**: Use Pydantic (Python) + Zod (TypeScript) with shared schemas.

**Python** (Pydantic):
```python
from pydantic import BaseModel, Field, validator
from typing import Optional, Literal

class TradeSignal(BaseModel):
    symbol: str = Field(..., pattern=r'^[A-Z]{2,10}USDT$')
    action: Literal['BUY', 'SELL']
    entry_price: float = Field(..., gt=0)
    targets: list[float] = Field(..., min_items=1, max_items=5)
    stop_loss: Optional[float] = None

    @validator('targets')
    def targets_must_be_ascending(cls, v, values):
        if sorted(v) != v:
            raise ValueError('Targets must be in ascending order')
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "symbol": "BTCUSDT",
                "action": "BUY",
                "entry_price": 50000.0,
                "targets": [51000, 52000, 53000],
                "stop_loss": 49000
            }
        }
```

**TypeScript** (Zod - matching schema):
```typescript
import { z } from 'zod';

const TradeSignalSchema = z.object({
  symbol: z.string().regex(/^[A-Z]{2,10}USDT$/),
  action: z.enum(['BUY', 'SELL']),
  entry_price: z.number().positive(),
  targets: z.array(z.number()).min(1).max(5),
  stop_loss: z.number().optional(),
}).refine(
  (data) => {
    const sorted = [...data.targets].sort((a, b) => a - b);
    return JSON.stringify(sorted) === JSON.stringify(data.targets);
  },
  { message: 'Targets must be in ascending order' }
);

export type TradeSignal = z.infer<typeof TradeSignalSchema>;

// Runtime validation
export function validateTradeSignal(data: unknown): TradeSignal {
  return TradeSignalSchema.parse(data);
}
```

### 2. Data Serialization & Deserialization

**Common pitfalls**:
- Python `datetime` → JavaScript `Date`
- Python `Decimal` → JavaScript `number`
- Python `None` → JavaScript `null`
- Case sensitivity (snake_case vs camelCase)

**Solution**: Custom JSON encoders/decoders

**Python**:
```python
from datetime import datetime
from decimal import Decimal
import json

class PythonJSONEncoder(json.JSONEncoder):
    """Custom encoder for Python → JSON → TypeScript."""

    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        if isinstance(obj, Decimal):
            return float(obj)
        if isinstance(obj, set):
            return list(obj)
        return super().default(obj)

# Usage
data = {
    "timestamp": datetime.now(),
    "price": Decimal("50000.12345"),
    "symbols": {"BTC", "ETH"}
}

json_str = json.dumps(data, cls=PythonJSONEncoder)
# Result: {"timestamp": "2025-12-10T14:30:00", "price": 50000.12345, "symbols": ["BTC", "ETH"]}
```

**TypeScript**:
```typescript
// Custom deserializer
export function deserializePythonJSON(json: string): any {
  return JSON.parse(json, (key, value) => {
    // Convert ISO strings to Date objects
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return new Date(value);
    }
    return value;
  });
}

// Usage
const data = deserializePythonJSON(response);
// data.timestamp is now a Date object
```

### 3. Authentication & Security

**Pattern A: JWT Token Exchange**

**Python** (FastAPI):
```python
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from datetime import datetime, timedelta

SECRET_KEY = os.getenv("JWT_SECRET")
ALGORITHM = "HS256"

security = HTTPBearer()

def create_access_token(data: dict, expires_delta: timedelta = timedelta(hours=1)):
    to_encode = data.copy()
    expire = datetime.utcnow() + expires_delta
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_id
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

@app.get("/api/protected")
async def protected_route(user_id: str = Depends(verify_token)):
    return {"user_id": user_id, "message": "Access granted"}
```

**TypeScript** (Next.js):
```typescript
// lib/python-auth.ts
export class PythonServiceAuth {
  private token: string | null = null;

  async authenticate(userId: string): Promise<void> {
    const response = await fetch(`${process.env.PYTHON_SERVICE_URL}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });

    const { access_token } = await response.json();
    this.token = access_token;
  }

  async request(endpoint: string, options: RequestInit = {}): Promise<Response> {
    if (!this.token) {
      throw new Error('Not authenticated');
    }

    return fetch(`${process.env.PYTHON_SERVICE_URL}${endpoint}`, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${this.token}`,
      },
    });
  }
}
```

**Pattern B: Webhook Secret Validation**

**Python**:
```python
import hmac
import hashlib
from fastapi import HTTPException, Header

WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET")

def verify_webhook_signature(
    payload: bytes,
    signature: str = Header(..., alias="X-Webhook-Signature")
):
    """Verify HMAC signature from Next.js."""
    expected = hmac.new(
        WEBHOOK_SECRET.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=401, detail="Invalid signature")

@app.post("/webhook")
async def webhook_handler(
    request: Request,
    _: None = Depends(verify_webhook_signature)
):
    payload = await request.body()
    data = json.loads(payload)
    # Process webhook
    return {"status": "received"}
```

**TypeScript** (Next.js):
```typescript
import crypto from 'crypto';

export async function sendWebhook(data: any): Promise<void> {
  const payload = JSON.stringify(data);
  const signature = crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET!)
    .update(payload)
    .digest('hex');

  await fetch(`${process.env.PYTHON_SERVICE_URL}/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': signature,
    },
    body: payload,
  });
}
```

**Pattern C: Encrypted Data Storage**

**Python** (Fernet encryption):
```python
from cryptography.fernet import Fernet
import os

ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY").encode()
cipher = Fernet(ENCRYPTION_KEY)

def encrypt_api_key(api_key: str) -> str:
    """Encrypt API key for storage."""
    return cipher.encrypt(api_key.encode()).decode()

def decrypt_api_key(encrypted_key: str) -> str:
    """Decrypt API key for use."""
    return cipher.decrypt(encrypted_key.encode()).decode()
```

**TypeScript** (AES-256-GCM - existing in CartelBot):
```typescript
// lib/encryption.ts (already exists in project)
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
}

export function decrypt(encrypted: string): string {
  const [ivHex, encryptedHex, authTagHex] = encrypted.split(':');
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    KEY,
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return decipher.update(encryptedHex, 'hex', 'utf8') + decipher.final('utf8');
}
```

### 4. Error Handling & Resilience

**Python** (FastAPI error handlers):
```python
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
import logging

logger = logging.getLogger(__name__)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle Pydantic validation errors."""
    logger.error(f"Validation error: {exc.errors()}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "validation_error",
            "details": exc.errors()
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Catch-all error handler."""
    logger.exception("Unhandled exception")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "internal_server_error",
            "message": str(exc) if os.getenv("DEBUG") else "An error occurred"
        }
    )
```

**TypeScript** (Retry with exponential backoff):
```typescript
// lib/python-client.ts
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on validation errors
      if (error instanceof Error && error.message.includes('validation_error')) {
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = baseDelay * Math.pow(2, i);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

// Usage
const result = await retryWithBackoff(
  () => pythonClient.parseSignal(data),
  3,
  1000
);
```

### 5. Performance Optimization

**Connection Pooling** (Python):
```python
import httpx
from contextlib import asynccontextmanager

# Global connection pool
http_client: httpx.AsyncClient | None = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle."""
    global http_client

    # Startup: Create connection pool
    http_client = httpx.AsyncClient(
        timeout=30.0,
        limits=httpx.Limits(max_keepalive_connections=20, max_connections=100)
    )

    yield

    # Shutdown: Close connections
    await http_client.aclose()

app = FastAPI(lifespan=lifespan)

@app.get("/api/external")
async def fetch_external_data():
    """Use shared connection pool."""
    response = await http_client.get("https://api.binance.com/api/v3/ticker/price")
    return response.json()
```

**Caching** (Python + Redis):
```python
import redis.asyncio as redis
import json
from functools import wraps

redis_client = redis.Redis(host='localhost', port=6379, decode_responses=True)

def cache(ttl: int = 60):
    """Cache decorator with TTL."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Create cache key
            cache_key = f"{func.__name__}:{json.dumps(args)}:{json.dumps(kwargs)}"

            # Check cache
            cached = await redis_client.get(cache_key)
            if cached:
                return json.loads(cached)

            # Execute function
            result = await func(*args, **kwargs)

            # Store in cache
            await redis_client.setex(cache_key, ttl, json.dumps(result))

            return result
        return wrapper
    return decorator

@app.get("/api/prices/{symbol}")
@cache(ttl=5)  # Cache for 5 seconds
async def get_price(symbol: str):
    # Expensive operation
    response = await http_client.get(f"https://api.binance.com/api/v3/ticker/price?symbol={symbol}")
    return response.json()
```

## Configuration & Environment Management

### Environment Variables

**Python** (.env):
```bash
# Python service configuration
PYTHON_SERVICE_PORT=8000
DATABASE_URL=mongodb://localhost:27017/cartelbot
REDIS_URL=redis://localhost:6379
LOG_LEVEL=INFO

# Security
JWT_SECRET=your-jwt-secret
ENCRYPTION_KEY=your-encryption-key
WEBHOOK_SECRET=your-webhook-secret

# External services
BINANCE_API_URL=https://api.binance.com
```

**Next.js** (.env.local):
```bash
# Python service connection
PYTHON_SERVICE_URL=http://localhost:8000
PYTHON_SERVICE_TIMEOUT=10000

# Shared secrets (must match Python)
JWT_SECRET=your-jwt-secret
WEBHOOK_SECRET=your-webhook-secret
ENCRYPTION_KEY=your-encryption-key
```

**Python** (Environment validation):
```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    python_service_port: int = 8000
    database_url: str
    redis_url: str
    log_level: str = "INFO"
    jwt_secret: str
    encryption_key: str
    webhook_secret: str

    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()

# Use throughout app
app = FastAPI(debug=settings.log_level == "DEBUG")
```

**TypeScript** (Environment validation with Zod):
```typescript
// lib/env.ts (already exists in CartelBot)
import { z } from 'zod';

const envSchema = z.object({
  PYTHON_SERVICE_URL: z.string().url(),
  PYTHON_SERVICE_TIMEOUT: z.string().regex(/^\d+$/).transform(Number),
  JWT_SECRET: z.string().min(32),
  WEBHOOK_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().length(64), // 32 bytes hex
});

export const env = envSchema.parse(process.env);
```

## Testing Strategies

### Unit Testing (Python - pytest):
```python
import pytest
from httpx import AsyncClient
from main import app

@pytest.mark.asyncio
async def test_parse_signal():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post("/api/parse-signal", json={
            "symbol": "BTCUSDT",
            "entry_price": 50000,
            "targets": [51000, 52000],
        })

        assert response.status_code == 200
        data = response.json()
        assert data["symbol"] == "BTCUSDT"
        assert data["targets_count"] == 2

@pytest.mark.asyncio
async def test_invalid_signal():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post("/api/parse-signal", json={
            "symbol": "BTC",  # Invalid: too short
            "entry_price": -100,  # Invalid: negative
            "targets": [],  # Invalid: empty
        })

        assert response.status_code == 422  # Validation error
```

### Integration Testing (TypeScript - Vitest):
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { signalParser } from '@/lib/python-services/signal-parser';

describe('Python Signal Parser Integration', () => {
  beforeAll(async () => {
    // Ensure Python service is running
    const isHealthy = await signalParser.healthCheck();
    if (!isHealthy) {
      throw new Error('Python service not available');
    }
  });

  it('should parse valid signal', async () => {
    const result = await signalParser.parseSignal({
      symbol: 'BTCUSDT',
      entry_price: 50000,
      targets: [51000, 52000],
    });

    expect(result.symbol).toBe('BTCUSDT');
    expect(result.targets_count).toBe(2);
  });

  it('should reject invalid signal', async () => {
    await expect(
      signalParser.parseSignal({
        symbol: 'INVALID',
        entry_price: -100,
        targets: [],
      })
    ).rejects.toThrow();
  });
});
```

### End-to-End Testing (Playwright):
```typescript
import { test, expect } from '@playwright/test';

test('signal parsing workflow', async ({ page }) => {
  await page.goto('/signals/new');

  // Fill signal form
  await page.fill('[name="symbol"]', 'BTCUSDT');
  await page.fill('[name="entry_price"]', '50000');
  await page.fill('[name="targets"]', '51000, 52000, 53000');

  // Submit (triggers Next.js → Python service)
  await page.click('button[type="submit"]');

  // Wait for Python service response
  await expect(page.locator('.success-message')).toBeVisible();
  await expect(page.locator('.targets-count')).toHaveText('3');
});
```

## Deployment Patterns

### Pattern 1: Docker Compose (Development/Testing)

```yaml
# docker-compose.yml
version: '3.8'

services:
  nextjs:
    build: .
    ports:
      - "3000:3000"
    environment:
      - PYTHON_SERVICE_URL=http://python-service:8000
    depends_on:
      - python-service

  python-service:
    build: ./services/discord-selfbot
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=mongodb://mongo:27017/cartelbot
      - REDIS_URL=redis://redis:6379
    depends_on:
      - mongo
      - redis

  mongo:
    image: mongo:6.0
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  mongo-data:
```

### Pattern 2: Process Manager (Production)

**PM2 Ecosystem** (ecosystem.config.js):
```javascript
module.exports = {
  apps: [
    {
      name: 'nextjs',
      script: 'npm',
      args: 'start',
      cwd: './',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        PYTHON_SERVICE_URL: 'http://localhost:8000'
      }
    },
    {
      name: 'python-service',
      script: 'uvicorn',
      args: 'main:app --host 0.0.0.0 --port 8000',
      cwd: './services/discord-selfbot',
      interpreter: 'python3',
      env: {
        DATABASE_URL: 'mongodb://localhost:27017/cartelbot',
        LOG_LEVEL: 'INFO'
      }
    }
  ]
};
```

### Health Checks & Monitoring

**Python** (Health endpoint):
```python
from datetime import datetime

startup_time = datetime.now()

@app.get("/health")
async def health_check():
    """Comprehensive health check."""

    # Check database
    db_healthy = await check_database_connection()

    # Check Redis
    redis_healthy = await redis_client.ping()

    # Calculate uptime
    uptime = (datetime.now() - startup_time).total_seconds()

    return {
        "status": "healthy" if (db_healthy and redis_healthy) else "degraded",
        "uptime_seconds": uptime,
        "database": "connected" if db_healthy else "disconnected",
        "redis": "connected" if redis_healthy else "disconnected",
        "version": "1.0.0"
    }
```

**TypeScript** (Health check monitor):
```typescript
// lib/python-health.ts
export async function monitorPythonService(): Promise<void> {
  setInterval(async () => {
    try {
      const response = await fetch(`${process.env.PYTHON_SERVICE_URL}/health`);
      const health = await response.json();

      if (health.status !== 'healthy') {
        console.error('Python service degraded:', health);
        // Send alert to monitoring service
      }
    } catch (error) {
      console.error('Python service unreachable:', error);
      // Send alert to monitoring service
    }
  }, 30000); // Check every 30 seconds
}
```

## Common Pitfalls & Solutions

### ❌ Pitfall 1: Blocking I/O in Async Context

**Bad**:
```python
async def endpoint():
    result = requests.get(url)  # ✗ Blocks event loop
    return result
```

**Good**:
```python
async def endpoint():
    async with httpx.AsyncClient() as client:
        result = await client.get(url)  # ✓ Non-blocking
        return result
```

### ❌ Pitfall 2: Unhandled Serialization

**Bad**:
```python
from datetime import datetime

@app.get("/api/data")
def get_data():
    return {"timestamp": datetime.now()}  # ✗ Fails: datetime not JSON serializable
```

**Good**:
```python
@app.get("/api/data")
def get_data():
    return {"timestamp": datetime.now().isoformat()}  # ✓ ISO 8601 string
```

### ❌ Pitfall 3: Missing Timeout

**Bad**:
```typescript
// ✗ No timeout - can hang indefinitely
const result = await fetch(pythonServiceUrl);
```

**Good**:
```typescript
// ✓ Abort after 10 seconds
const controller = new AbortController();
setTimeout(() => controller.abort(), 10000);

const result = await fetch(pythonServiceUrl, { signal: controller.signal });
```

### ❌ Pitfall 4: Exposing Internal Errors

**Bad**:
```python
@app.exception_handler(Exception)
async def error_handler(request, exc):
    return JSONResponse({"error": str(exc)})  # ✗ Exposes stack traces
```

**Good**:
```python
@app.exception_handler(Exception)
async def error_handler(request, exc):
    logger.exception("Internal error")
    return JSONResponse({
        "error": "internal_error",
        "message": "An error occurred" if not DEBUG else str(exc)
    })
```

### ❌ Pitfall 5: No Input Validation

**Bad**:
```python
@app.post("/api/execute")
async def execute(data: dict):  # ✗ No validation
    symbol = data["symbol"]  # Can crash if missing
    return {"result": "ok"}
```

**Good**:
```python
class ExecuteRequest(BaseModel):
    symbol: str = Field(..., pattern=r'^[A-Z]+$')

@app.post("/api/execute")
async def execute(data: ExecuteRequest):  # ✓ Validated
    return {"result": "ok"}
```

## Real-World Example: Discord Signal Integration

See [examples/discord-integration/README.md](examples/discord-integration/README.md) for complete implementation.

**Architecture**:
```
Discord → Python (discord.py-self) → Parse Message → Webhook (Next.js)
                                                            ↓
                                                      Store in MongoDB
                                                            ↓
                                                      Execute Trade
                                                            ↓
                                                      SSE Notification
```

**Key files**:
- `services/discord-selfbot/main.py` - FastAPI service
- `app/api/discord/webhook/route.ts` - Next.js webhook handler
- `lib/python-services/discord-client.ts` - TypeScript client

## Related Documentation

- [PYTHON_LIBRARIES.md](PYTHON_LIBRARIES.md) - Recommended Python libraries
- [NEXTJS_PATTERNS.md](NEXTJS_PATTERNS.md) - Next.js-specific patterns
- [COMPATIBILITY_MATRIX.md](COMPATIBILITY_MATRIX.md) - Version compatibility
- [reference/type-generation.md](reference/type-generation.md) - Type generation guide
- [reference/api-binding.md](reference/api-binding.md) - API binding patterns
- [scripts/generate-types.py](scripts/generate-types.py) - Type generation script
- [scripts/check-compatibility.py](scripts/check-compatibility.py) - Compatibility checker

## Quick Reference Commands

```bash
# Start Python service (development)
cd services/discord-selfbot
uvicorn main:app --reload --port 8000

# Start Next.js (development)
npm run dev

# Run both with Docker Compose
docker-compose up

# Test Python service
pytest tests/

# Test Next.js integration
npm run test

# Health check
curl http://localhost:8000/health
```

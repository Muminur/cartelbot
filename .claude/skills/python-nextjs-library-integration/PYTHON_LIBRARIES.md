# Python Libraries for Next.js Integration

This document provides comprehensive guidance on selecting and integrating Python libraries for Next.js applications.

## HTTP/Web Frameworks

### FastAPI ⭐ Recommended

**Why use it**:
- Native async support (asyncio/await)
- Automatic OpenAPI/Swagger documentation
- Pydantic validation out-of-the-box
- WebSocket support built-in
- Excellent performance (comparable to Node.js/Go)
- Type hints enforced

**Installation**:
```bash
pip install fastapi uvicorn[standard] pydantic
```

**Basic setup**:
```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

app = FastAPI(title="Trading Bot API", version="1.0.0")

class TradeSignal(BaseModel):
    symbol: str = Field(..., pattern=r'^[A-Z]+USDT$')
    entry: float = Field(..., gt=0)
    targets: list[float]

@app.post("/api/signals/parse")
async def parse_signal(signal: TradeSignal):
    return {"status": "parsed", "symbol": signal.symbol}

# Run with: uvicorn main:app --reload
```

**Next.js integration**:
```typescript
const response = await fetch('http://localhost:8000/api/signals/parse', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    symbol: 'BTCUSDT',
    entry: 50000,
    targets: [51000, 52000]
  })
});
```

**CartelBot usage**: Discord webhook service (`services/discord-selfbot/main.py`)

---

### Flask

**Why use it**:
- Lightweight, minimal overhead
- Large ecosystem of extensions
- Simple for small services
- Well-documented

**Trade-offs**:
- Manual async handling (requires `async-flask`)
- Less built-in validation
- No automatic API docs

**Installation**:
```bash
pip install flask flask-cors
```

**Basic setup**:
```python
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route('/api/parse', methods=['POST'])
def parse_signal():
    data = request.get_json()
    return jsonify({"status": "parsed", "data": data})

# Run with: flask run
```

**When to use**: Simple synchronous operations, legacy codebases

---

### Django

**Why use it**:
- Full-featured framework (ORM, admin, auth)
- Django REST Framework for APIs
- Built-in security features
- Excellent for larger applications

**Trade-offs**:
- Heavier than FastAPI/Flask
- Slower startup time
- Overkill for microservices

**Installation**:
```bash
pip install django djangorestframework
```

**When to use**: Complex applications requiring database management, authentication, and admin interfaces

---

## Data Processing & Analysis

### NumPy

**Purpose**: Numerical computing, array operations

**Installation**:
```bash
pip install numpy
```

**Usage**:
```python
import numpy as np

def calculate_targets(entry: float, percentages: list[float]) -> list[float]:
    """Calculate target prices from percentages."""
    arr = np.array(percentages)
    targets = entry * (1 + arr / 100)
    return targets.tolist()  # Convert to Python list for JSON

# Usage
targets = calculate_targets(50000, [2, 5, 10, 15])
# [51000.0, 52500.0, 55000.0, 57500.0]
```

**TypeScript integration**:
```typescript
const response = await fetch('/api/calculate-targets', {
  method: 'POST',
  body: JSON.stringify({ entry: 50000, percentages: [2, 5, 10, 15] })
});
const targets: number[] = await response.json();
```

**Warning**: Large arrays are slow to serialize. Use pagination for datasets >10,000 elements.

---

### Pandas

**Purpose**: Data manipulation, time series analysis

**Installation**:
```bash
pip install pandas
```

**Usage**:
```python
import pandas as pd
from datetime import datetime

def analyze_trades(trades: list[dict]) -> dict:
    """Analyze trading performance."""
    df = pd.DataFrame(trades)

    analysis = {
        "total_trades": len(df),
        "win_rate": (df['pnl'] > 0).mean() * 100,
        "avg_pnl": df['pnl'].mean(),
        "best_symbol": df.groupby('symbol')['pnl'].sum().idxmax()
    }

    return analysis
```

**Serialization**:
```python
# Convert DataFrame to JSON-safe format
result = df.to_dict(orient='records')
```

**When to use**: Trading analytics, historical data analysis, statistical calculations

---

## Real-Time Communication

### python-socketio

**Purpose**: WebSocket communication (Socket.IO protocol)

**Installation**:
```bash
pip install python-socketio
```

**Server setup** (with FastAPI):
```python
import socketio
from fastapi import FastAPI

sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
app = FastAPI()
socket_app = socketio.ASGIApp(sio, app)

@sio.on('connect')
async def connect(sid, environ):
    print(f'Client {sid} connected')

@sio.on('subscribe')
async def subscribe(sid, data):
    await sio.emit('price_update', {'symbol': 'BTC', 'price': 50000}, room=sid)

# Run with: uvicorn main:socket_app --reload
```

**Next.js client**:
```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:8000');

socket.on('connect', () => {
  socket.emit('subscribe', { symbol: 'BTCUSDT' });
});

socket.on('price_update', (data) => {
  console.log('Price:', data);
});
```

---

### aiohttp

**Purpose**: Async HTTP client/server

**Installation**:
```bash
pip install aiohttp
```

**Client usage**:
```python
import aiohttp

async def fetch_binance_price(symbol: str) -> float:
    """Fetch current price from Binance."""
    async with aiohttp.ClientSession() as session:
        async with session.get(
            f"https://api.binance.com/api/v3/ticker/price?symbol={symbol}"
        ) as response:
            data = await response.json()
            return float(data['price'])

# Usage in FastAPI
@app.get("/api/price/{symbol}")
async def get_price(symbol: str):
    price = await fetch_binance_price(symbol)
    return {"symbol": symbol, "price": price}
```

**Why use**: Non-blocking HTTP requests, connection pooling, session management

---

## Security & Cryptography

### cryptography

**Purpose**: Encryption, hashing, key management

**Installation**:
```bash
pip install cryptography
```

**AES-256-GCM encryption**:
```python
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os

def encrypt_api_key(api_key: str, master_key: bytes) -> str:
    """Encrypt API key with AES-256-GCM."""
    aesgcm = AESGCM(master_key)  # 32 bytes for AES-256
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, api_key.encode(), None)

    # Return nonce:ciphertext (hex encoded)
    return f"{nonce.hex()}:{ciphertext.hex()}"

def decrypt_api_key(encrypted: str, master_key: bytes) -> str:
    """Decrypt API key."""
    nonce_hex, ciphertext_hex = encrypted.split(':')
    nonce = bytes.fromhex(nonce_hex)
    ciphertext = bytes.fromhex(ciphertext_hex)

    aesgcm = AESGCM(master_key)
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    return plaintext.decode()

# Usage
KEY = os.getenv("ENCRYPTION_KEY").encode()
encrypted = encrypt_api_key("sk-12345", KEY)
decrypted = decrypt_api_key(encrypted, KEY)
```

**Fernet (simple encryption)**:
```python
from cryptography.fernet import Fernet

# Generate key (do this once, store in .env)
key = Fernet.generate_key()

cipher = Fernet(key)
encrypted = cipher.encrypt(b"secret data")
decrypted = cipher.decrypt(encrypted)
```

**CartelBot usage**: Discord token encryption (`services/discord-selfbot`)

---

### PyJWT

**Purpose**: JWT token generation/validation

**Installation**:
```bash
pip install pyjwt
```

**Token creation**:
```python
import jwt
from datetime import datetime, timedelta

SECRET_KEY = "your-secret-key"

def create_token(user_id: str) -> str:
    """Create JWT token with 1 hour expiry."""
    payload = {
        "user_id": user_id,
        "exp": datetime.utcnow() + timedelta(hours=1),
        "iat": datetime.utcnow()
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")

def verify_token(token: str) -> dict:
    """Verify and decode JWT token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        raise Exception("Token expired")
    except jwt.InvalidTokenError:
        raise Exception("Invalid token")
```

**Next.js integration**:
```typescript
// Python generates token
const tokenResponse = await fetch('/api/auth/token', {
  method: 'POST',
  body: JSON.stringify({ user_id: '123' })
});
const { token } = await tokenResponse.json();

// Next.js uses token
const dataResponse = await fetch('/api/protected-data', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

---

## Database Clients

### Motor (Async MongoDB)

**Purpose**: Async MongoDB driver (compatible with asyncio)

**Installation**:
```bash
pip install motor
```

**Usage** (with FastAPI):
```python
from motor.motor_asyncio import AsyncIOMotorClient
from typing import Optional

# Global connection
client: Optional[AsyncIOMotorClient] = None

async def connect_to_database():
    global client
    client = AsyncIOMotorClient("mongodb://localhost:27017")

async def close_database_connection():
    global client
    if client:
        client.close()

@app.on_event("startup")
async def startup():
    await connect_to_database()

@app.on_event("shutdown")
async def shutdown():
    await close_database_connection()

# Usage in endpoints
@app.get("/api/signals/{signal_id}")
async def get_signal(signal_id: str):
    db = client.cartelbot
    signal = await db.signals.find_one({"_id": signal_id})
    return signal
```

**When to use**: Sharing MongoDB connection between Next.js and Python service

---

### Redis-py

**Purpose**: Caching, session storage, pub/sub

**Installation**:
```bash
pip install redis
```

**Async usage**:
```python
import redis.asyncio as redis
import json

redis_client = redis.Redis(host='localhost', port=6379, decode_responses=True)

async def cache_price(symbol: str, price: float, ttl: int = 60):
    """Cache price data with TTL."""
    await redis_client.setex(
        f"price:{symbol}",
        ttl,
        json.dumps({"price": price, "timestamp": datetime.now().isoformat()})
    )

async def get_cached_price(symbol: str) -> Optional[float]:
    """Get cached price."""
    data = await redis_client.get(f"price:{symbol}")
    if data:
        return json.loads(data)["price"]
    return None

# Decorator for caching
from functools import wraps

def cache(ttl: int = 60):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            cache_key = f"{func.__name__}:{json.dumps(args)}"

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

@cache(ttl=5)  # Cache for 5 seconds
async def get_expensive_data(symbol: str):
    # Expensive operation
    return {"symbol": symbol, "data": "..."}
```

---

## Serialization & Data Formats

### JSON (Built-in)

**Custom encoder**:
```python
import json
from datetime import datetime
from decimal import Decimal

class CustomJSONEncoder(json.JSONEncoder):
    """Handle datetime, Decimal, etc."""

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
    "price": Decimal("50000.123"),
    "symbols": {"BTC", "ETH"}
}

json_str = json.dumps(data, cls=CustomJSONEncoder)
# {"timestamp": "2025-12-10T14:30:00", "price": 50000.123, "symbols": ["BTC", "ETH"]}
```

---

### msgpack

**Purpose**: Fast binary serialization (2-3x smaller than JSON)

**Installation**:
```bash
pip install msgpack
```

**Usage**:
```python
import msgpack

# Serialize
data = {"symbol": "BTCUSDT", "price": 50000}
packed = msgpack.packb(data)

# Deserialize
unpacked = msgpack.unpackb(packed)
```

**When to use**: Large payloads, low bandwidth, not human-readable debugging

---

### Protocol Buffers

**Purpose**: Strongly-typed binary format

**Installation**:
```bash
pip install protobuf
```

**Define schema** (signal.proto):
```protobuf
syntax = "proto3";

message TradeSignal {
  string symbol = 1;
  double entry_price = 2;
  repeated double targets = 3;
  double stop_loss = 4;
}
```

**Generate Python code**:
```bash
protoc --python_out=. signal.proto
```

**Usage**:
```python
from signal_pb2 import TradeSignal

signal = TradeSignal()
signal.symbol = "BTCUSDT"
signal.entry_price = 50000
signal.targets.extend([51000, 52000, 53000])

# Serialize
binary = signal.SerializeToString()

# Deserialize
received = TradeSignal()
received.ParseFromString(binary)
```

**When to use**: Complex nested structures, gRPC, strict type validation

---

## Testing Libraries

### pytest

**Purpose**: Unit testing, fixtures, parametrization

**Installation**:
```bash
pip install pytest pytest-asyncio httpx
```

**Test FastAPI endpoints**:
```python
import pytest
from httpx import AsyncClient
from main import app

@pytest.mark.asyncio
async def test_parse_signal():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post("/api/signals/parse", json={
            "symbol": "BTCUSDT",
            "entry_price": 50000,
            "targets": [51000, 52000]
        })

        assert response.status_code == 200
        data = response.json()
        assert data["symbol"] == "BTCUSDT"
        assert len(data["targets"]) == 2

@pytest.mark.asyncio
async def test_invalid_signal():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post("/api/signals/parse", json={
            "symbol": "INVALID",
            "entry_price": -100
        })

        assert response.status_code == 422  # Validation error
```

**Run tests**:
```bash
pytest tests/ -v
```

---

## Discord Integration

### discord.py-self

**Purpose**: User account automation (selfbot)

**Installation**:
```bash
pip install discord.py-self
```

**Basic usage**:
```python
import discord

client = discord.Client()

@client.event
async def on_ready():
    print(f'Logged in as {client.user}')

@client.event
async def on_message(message):
    if message.channel.id == TARGET_CHANNEL_ID:
        # Process message
        await process_signal(message.content)

client.run(TOKEN)
```

**⚠️ Warning**: Violates Discord ToS. Use at own risk.

**CartelBot usage**: `services/discord-selfbot/main.py`

---

## Environment & Configuration

### python-dotenv

**Purpose**: Load environment variables from .env

**Installation**:
```bash
pip install python-dotenv
```

**Usage**:
```python
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
API_KEY = os.getenv("BINANCE_API_KEY")
```

---

### pydantic-settings

**Purpose**: Type-safe settings management

**Installation**:
```bash
pip install pydantic-settings
```

**Usage**:
```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    redis_url: str
    log_level: str = "INFO"
    binance_api_key: str

    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()

# Access with type safety
print(settings.database_url)
```

---

## Recommended Stack for CartelBot

```python
# Core framework
fastapi==0.104.1
uvicorn[standard]==0.24.0
pydantic==2.5.0

# Database
motor==3.3.2
redis==5.0.1

# HTTP client
aiohttp==3.9.1
httpx==0.25.2

# Security
cryptography==41.0.7
pyjwt==2.8.0

# Discord (selfbot)
discord.py-self==2.1.0
tls-client==1.0.1

# Configuration
python-dotenv==1.0.0
pydantic-settings==2.1.0

# Testing
pytest==7.4.3
pytest-asyncio==0.21.1

# Utilities
python-multipart==0.0.6  # For file uploads
```

---

## Performance Tips

1. **Use async libraries**: `aiohttp` instead of `requests`, `motor` instead of `pymongo`
2. **Connection pooling**: Reuse HTTP clients and database connections
3. **Caching**: Use Redis for frequently-accessed data
4. **Lazy imports**: Import heavy libraries only when needed
5. **Batch operations**: Process multiple items in single database query

**Example** (Connection pooling):
```python
# ✗ Bad - Creates new connection every request
@app.get("/data")
async def get_data():
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            return await response.json()

# ✓ Good - Reuse connection pool
http_client = None

@app.on_event("startup")
async def startup():
    global http_client
    http_client = aiohttp.ClientSession()

@app.on_event("shutdown")
async def shutdown():
    await http_client.close()

@app.get("/data")
async def get_data():
    async with http_client.get(url) as response:
        return await response.json()
```

---

## Common Pitfalls

### ❌ Blocking I/O in async functions
```python
async def bad():
    result = requests.get(url)  # ✗ Blocks event loop
```

### ✓ Use async HTTP client
```python
async def good():
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            return await response.json()
```

### ❌ Forgetting to serialize datetime
```python
return {"timestamp": datetime.now()}  # ✗ Not JSON serializable
```

### ✓ Convert to ISO string
```python
return {"timestamp": datetime.now().isoformat()}  # ✓
```

### ❌ No timeout on external requests
```python
async with session.get(url) as response:  # ✗ Can hang forever
```

### ✓ Set timeout
```python
timeout = aiohttp.ClientTimeout(total=10)
async with session.get(url, timeout=timeout) as response:  # ✓
```

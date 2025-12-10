# API Binding Patterns

Patterns for binding Python APIs to Next.js applications.

## REST API Binding

### Python FastAPI Endpoint

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()

class SignalRequest(BaseModel):
    symbol: str
    entry: float

class SignalResponse(BaseModel):
    symbol: str
    status: str
    timestamp: str

@app.post("/api/signals/parse", response_model=SignalResponse)
async def parse_signal(request: SignalRequest):
    return SignalResponse(
        symbol=request.symbol,
        status="parsed",
        timestamp=datetime.now().isoformat()
    )
```

### TypeScript Client

```typescript
interface SignalRequest {
  symbol: string;
  entry: number;
}

interface SignalResponse {
  symbol: string;
  status: string;
  timestamp: string;
}

async function parseSignal(request: SignalRequest): Promise<SignalResponse> {
  const response = await fetch(`${PYTHON_SERVICE_URL}/api/signals/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return await response.json();
}
```

## WebSocket Binding

See SKILL.md Pattern 2 for complete WebSocket implementation.

## SSE Binding

See NEXTJS_PATTERNS.md for Server-Sent Events implementation.

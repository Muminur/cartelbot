# Discord Signal Integration Example

Real-world example from CartelBot showing complete Python ↔ Next.js integration.

## Architecture

```
Discord Server
    ↓ (User messages)
Python Discord Client (discord.py-self)
    ↓ (Parse message)
Python FastAPI Service
    ↓ (HTTP POST webhook)
Next.js API Route (/api/discord/webhook)
    ↓ (Validate + Store)
MongoDB (DiscordMessage collection)
    ↓ (Parse signal)
Signal Parser (existing Next.js logic)
    ↓ (Execute trade)
Trade Execution Engine
    ↓ (SSE events)
Frontend Real-time Notifications
```

## Key Files

### Python Service

**Location**: `services/discord-selfbot/main.py`

**Key features**:
- FastAPI server with discord.py-self client
- Token validation endpoint
- Multi-user client management
- Webhook signature validation
- Auto-reconnect with exponential backoff

**Endpoints**:
- `POST /token/validate` - Validate Discord token
- `POST /client/start` - Start Discord client
- `POST /client/stop` - Stop Discord client
- `GET /health` - Health check

### Next.js Webhook Handler

**Location**: `app/api/discord/webhook/route.ts`

**Key features**:
- HMAC signature verification
- Rate limiting
- MongoDB message storage
- Signal parsing integration
- SSE event emission

### TypeScript Client

**Location**: `lib/python-services/discord-client.ts`

**Key features**:
- Type-safe API calls
- Error handling
- Retry logic
- Timeout management

### React Components

**Location**: `components/discord/`

**Components**:
- `DiscordIntegrationClient.tsx` - Main UI
- `TokenInput.tsx` - Token validation
- `ServerSelector.tsx` - Guild selection
- `ChannelSelector.tsx` - Channel selection
- `MessageLog.tsx` - Message history
- `SignalNotificationPanel.tsx` - Real-time notifications

## Security Features

1. **Token Encryption**: Discord tokens encrypted with Fernet (Python) + AES-256-GCM (Next.js)
2. **Webhook Signatures**: HMAC SHA256 validation
3. **Rate Limiting**: 5 requests/15min on token validation
4. **TLS Fingerprinting**: Chrome browser emulation to avoid detection
5. **Input Validation**: Zod schemas on Next.js, Pydantic on Python

## Data Flow

### 1. User Connects Discord

```typescript
// User clicks "Connect Discord Channel"
const response = await fetch('/api/discord/connections', {
  method: 'POST',
  body: JSON.stringify({
    token: 'user_discord_token',
    guildId: '123',
    channelId: '456',
  }),
});

// Next.js calls Python service
await fetch(`${PYTHON_SERVICE_URL}/client/start`, {
  method: 'POST',
  body: JSON.stringify({
    connectionId: 'abc123',
    token: 'user_discord_token',
    guildId: '123',
    channelId: '456',
  }),
});

// Python service starts Discord client
// Monitors specified channel for messages
```

### 2. Discord Message Received

```python
# Python discord client receives message
@client.on_message
async def handle_message(message):
    if message.channel.id == target_channel_id:
        # Send to Next.js webhook
        await send_webhook({
            "connectionId": connection_id,
            "userId": user_id,
            "content": message.content,
            "timestamp": message.created_at.isoformat(),
        })
```

### 3. Next.js Processes Message

```typescript
// Webhook endpoint receives message
export async function POST(req: Request) {
  // 1. Verify signature
  verifyWebhookSignature(payload, signature);

  // 2. Store in MongoDB
  await DiscordMessage.create({
    userId,
    connectionId,
    content,
    timestamp,
  });

  // 3. Parse signal
  const signal = await parseSignal(content);

  // 4. Execute trade (if auto-execute enabled)
  if (signal && connection.autoExecute) {
    await executeTrade(signal, userId);
  }

  // 5. Emit SSE event
  eventEmitter.emit('signal_parsed', {
    userId,
    signal,
  });

  return Response.json({ status: 'received' });
}
```

### 4. Frontend Shows Real-time Update

```typescript
// SSE hook receives event
useDiscordNotifications('/api/discord/stream');

// Event received → Toast notification
toast.success(`Signal parsed: ${signal.symbol}`);

// Update notification panel
setRecentEvents((prev) => [newEvent, ...prev].slice(0, 50));
```

## Code Snippets

### Python Token Validation

```python
# services/discord-selfbot/main.py
@app.post("/token/validate")
async def validate_token(request: TokenValidationRequest):
    session = tls_client.Session(client_identifier="chrome_124")

    try:
        response = session.get(
            "https://discord.com/api/v10/users/@me",
            headers={
                "Authorization": request.token,
                "User-Agent": "Mozilla/5.0...",
                "X-Super-Properties": base64_encoded_props,
            },
        )

        if response.status_code == 200:
            user_data = response.json()
            return {
                "valid": True,
                "userId": user_data["id"],
                "username": user_data["username"],
            }
        else:
            return {"valid": False, "error": "Invalid token"}

    except Exception as e:
        return {"valid": False, "error": str(e)}
```

### Next.js SSE Stream

```typescript
// app/api/discord/stream/route.ts
export async function GET(req: NextRequest) {
  const userId = await getUserId(req);

  const stream = new ReadableStream({
    start(controller) {
      const listener = (event: DiscordEvent) => {
        if (event.userId === userId) {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(new TextEncoder().encode(data));
        }
      };

      eventEmitter.on('discord_event', listener);

      // Cleanup on disconnect
      req.signal.addEventListener('abort', () => {
        eventEmitter.off('discord_event', listener);
        controller.close();
      });
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

## Lessons Learned

1. **Token Security**: Never log Discord tokens, always encrypt at rest
2. **Rate Limiting**: Discord API has strict rate limits, cache user data
3. **Reconnection**: Implement exponential backoff for Discord disconnects
4. **TLS Fingerprinting**: Required to avoid "Unusual activity" errors
5. **State Sync**: Keep Python service state in sync with MongoDB
6. **Error Handling**: Gracefully handle Discord API errors (401, 429, 503)
7. **SSE Cleanup**: Always remove event listeners on disconnect to prevent memory leaks

## Related Files

- **Python Service**: `services/discord-selfbot/`
- **Next.js APIs**: `app/api/discord/`
- **Components**: `components/discord/`
- **Types**: `types/discord.ts`
- **Utilities**: `lib/python-services/discord-client.ts`

## Performance

- **Token Validation**: 100-200ms (direct Discord API)
- **Message Detection**: <50ms (Python client)
- **Webhook Processing**: 200-500ms (includes DB write + signal parse)
- **SSE Latency**: <100ms (in-memory event emitter)

## Deployment

```yaml
# docker-compose.yml
services:
  nextjs:
    environment:
      - DISCORD_PYTHON_SERVICE_URL=http://python-service:8000
      - DISCORD_WEBHOOK_SECRET=secret123

  python-service:
    build: ./services/discord-selfbot
    environment:
      - WEBHOOK_SECRET=secret123
      - WEBHOOK_URL=http://nextjs:3000/api/discord/webhook
```

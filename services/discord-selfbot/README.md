# CartelBot Discord Self-Bot Service

Python service that connects to Discord as user accounts and forwards trading signals to the CartelBot Next.js API.

## Features

- Multi-user Discord client management (up to 10 simultaneous connections)
- Message filtering and sanitization
- Automatic deduplication (in-memory + database)
- Retry logic with exponential backoff
- Auto-reconnect with connection resilience
- Token encryption using Fernet
- Health check endpoint
- Production-ready Docker support

## Installation

### Local Development

1. **Create virtual environment**:
```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
```

2. **Install dependencies**:
```bash
pip install -r requirements.txt
```

3. **Configure environment**:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Generate encryption key**:
```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

5. **Run the service**:
```bash
python main.py
```

The service will start on `http://localhost:8000`.

### Docker Deployment

1. **Build image**:
```bash
docker build -t cartelbot-discord-selfbot .
```

2. **Run container**:
```bash
docker run -d \
  --name discord-selfbot \
  -p 8000:8000 \
  --env-file .env \
  cartelbot-discord-selfbot
```

## API Endpoints

### Health Check
```
GET /health
```
Returns service health status, uptime, and active client count.

### Start Client
```
POST /client/start
Content-Type: application/json

{
  "userId": "user_id_from_cartelbot",
  "connectionId": "connection_doc_id",
  "token": "encrypted_discord_token",
  "serverId": "discord_server_id",
  "channelId": "discord_channel_id"
}
```

### Stop Client
```
POST /client/stop
Content-Type: application/json

{
  "userId": "user_id_from_cartelbot"
}
```

### Get Client Status
```
GET /client/status?userId=user_id_from_cartelbot
```

Get all clients:
```
GET /client/status
```

## Environment Variables

See `.env.example` for all configuration options:

- `DATABASE_URL`: MongoDB connection string
- `NEXTJS_API_URL`: Next.js API base URL
- `NEXTJS_WEBHOOK_SECRET`: Webhook authentication secret
- `ENCRYPTION_KEY`: Fernet encryption key
- `MAX_CLIENTS`: Maximum simultaneous clients (default: 10)
- `MESSAGE_DELAY_MIN`: Minimum delay before processing (seconds)
- `MESSAGE_DELAY_MAX`: Maximum delay before processing (seconds)

## Security Notes

1. **Token Encryption**: All Discord tokens are encrypted using Fernet symmetric encryption before storage
2. **Webhook Authentication**: Uses secret header for API authentication
3. **Rate Limiting**: Random delays (1-3s) between actions to appear human-like
4. **Sanitization**: Removes mentions, emojis, and channel references from messages
5. **Non-root User**: Docker container runs as non-root user (UID 1001)

## Architecture

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────┐
│   Discord   │◄────►│  Python Service  │◄────►│  Next.js    │
│   Servers   │      │  (Self-Bot)      │      │  API        │
└─────────────┘      └──────────────────┘      └─────────────┘
                             │
                             ▼
                      ┌──────────────┐
                      │   MongoDB    │
                      └──────────────┘
```

### Components

1. **main.py**: FastAPI server with startup/shutdown handlers
2. **client_manager.py**: Multi-user Discord client lifecycle management
3. **message_handler.py**: Message filtering, sanitization, deduplication
4. **signal_forwarder.py**: HTTP client for Next.js API webhook
5. **encryption.py**: Token encryption/decryption utilities
6. **health.py**: Health check logic with MongoDB connectivity test

## Message Flow

1. User message posted in Discord channel
2. Discord client receives message via `on_message` event
3. Filter: Check if from monitored channel
4. Filter: Check if duplicate (in-memory + database)
5. Add random delay (1-3s) for human-like behavior
6. Sanitize content (remove mentions, emojis)
7. Forward to Next.js API webhook with retry logic
8. Store message ID in database for deduplication

## Monitoring

### Health Check Response
```json
{
  "status": "healthy",
  "uptime_seconds": 3600.45,
  "active_clients": 5,
  "mongodb_connected": true,
  "timestamp": 1234567890.123
}
```

### Client Status Response
```json
{
  "userId": "user_id",
  "connectionId": "connection_id",
  "connected": true,
  "serverId": "server_id",
  "channelId": "channel_id",
  "startedAt": "2025-12-02T12:00:00",
  "reconnectCount": 0,
  "lastError": null
}
```

## Error Handling

- **Invalid Token**: Client stops immediately, returns error
- **Connection Loss**: Auto-reconnect with exponential backoff (max 5 attempts)
- **API Failure**: Retry 3 times with 1s incremental delay
- **Database Error**: Graceful degradation, continues processing

## Logging

Logs include:
- Client lifecycle events (connect, disconnect, error)
- Message processing (received, filtered, forwarded)
- API communication (success, failure, retry)
- Error traces with full context

Log level configurable via `LOG_LEVEL` environment variable.

## Development

### Running Tests
```bash
# TODO: Add pytest tests
pytest tests/
```

### Code Quality
```bash
# Format code
black .

# Lint
pylint *.py

# Type check
mypy *.py
```

## License

Proprietary - CartelBot Trading System

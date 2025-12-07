"""
FastAPI server for Discord self-bot service.

This service connects to Discord as user accounts and forwards messages
to the CartelBot Next.js API for signal processing.
"""
import os
import logging
import asyncio
from contextlib import asynccontextmanager
from typing import Optional
import discord
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import tls_client
import base64
import json

from client_manager import ClientManager


# Discord client fingerprint for anti-detection
# Mimics real Discord web client to avoid self-bot detection
DISCORD_BUILD_NUMBER = 291963  # Update periodically from Discord client
BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
BROWSER_VERSION = "124.0.0.0"

# TLS Client identifier - mimics Chrome 124 TLS/JA3 fingerprint
# This provides browser-level TLS fingerprinting without curl_cffi crashes
TLS_CLIENT_IDENTIFIER = "chrome_124"


def get_super_properties() -> str:
    """
    Generate X-Super-Properties header to mimic real Discord client.
    This helps avoid detection as a self-bot by matching real client fingerprints.
    """
    properties = {
        "os": "Windows",
        "browser": "Chrome",
        "device": "",
        "system_locale": "en-US",
        "browser_user_agent": BROWSER_USER_AGENT,
        "browser_version": BROWSER_VERSION,
        "os_version": "10",
        "referrer": "",
        "referring_domain": "",
        "referrer_current": "",
        "referring_domain_current": "",
        "release_channel": "stable",
        "client_build_number": DISCORD_BUILD_NUMBER,
        "client_event_source": None,
        "design_id": 0
    }
    return base64.b64encode(json.dumps(properties).encode()).decode()


def get_discord_headers(token: str) -> dict:
    """
    Generate complete Discord client headers for anti-detection.
    Includes all headers a real Discord web client would send.
    """
    return {
        "Authorization": token,
        "User-Agent": BROWSER_USER_AGENT,
        "X-Super-Properties": get_super_properties(),
        "X-Discord-Locale": "en-US",
        "X-Discord-Timezone": "America/New_York",
        "Content-Type": "application/json",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Origin": "https://discord.com",
        "Referer": "https://discord.com/channels/@me",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"'
    }


def create_tls_session() -> tls_client.Session:
    """
    Create a TLS session with Chrome browser fingerprint.
    Uses tls_client (Go-based) which works on Windows without crashes.
    Provides real Chrome TLS/JA3 fingerprinting for anti-detection.
    """
    return tls_client.Session(
        client_identifier=TLS_CLIENT_IDENTIFIER,
        random_tls_extension_order=True  # Randomize TLS extension order like real browsers
    )


from health import check_health

# Load environment variables
load_dotenv()

# Configure logging
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global instances
mongo_client: Optional[AsyncIOMotorClient] = None
client_manager: Optional[ClientManager] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown event handlers."""
    global mongo_client, client_manager

    # Startup
    logger.info("Starting Discord Self-Bot Service...")

    # Validate required environment variables
    required_env_vars = {
        "DATABASE_URL": "MongoDB connection string",
        "NEXTJS_API_URL": "Next.js API base URL",
        "NEXTJS_WEBHOOK_SECRET": "Webhook secret for Next.js communication",
        "ENCRYPTION_KEY": "Fernet encryption key for token storage",
    }

    missing_vars = []
    for var_name, description in required_env_vars.items():
        var_value = os.getenv(var_name)
        if not var_value or var_value.strip() == "":
            missing_vars.append(f"{var_name} ({description})")

    if missing_vars:
        error_msg = "Missing required environment variables:\n  - " + "\n  - ".join(missing_vars)
        logger.error(error_msg)
        raise ValueError(error_msg)

    # Security: In production, ensure NEXTJS_WEBHOOK_SECRET is not a default/example value
    webhook_secret = os.getenv("NEXTJS_WEBHOOK_SECRET", "")
    if os.getenv("NODE_ENV") == "production" or os.getenv("PYTHON_ENV") == "production":
        if webhook_secret in ["your_secret_here_generate_with_openssl_rand_hex_32", "changeme", "test"]:
            logger.error("NEXTJS_WEBHOOK_SECRET must be changed from default value in production")
            raise ValueError("NEXTJS_WEBHOOK_SECRET must be a secure random value in production")

    logger.info("Environment variable validation passed")

    # Connect to MongoDB
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        logger.error("DATABASE_URL not set in environment")
        raise ValueError("DATABASE_URL environment variable is required")

    try:
        mongo_client = AsyncIOMotorClient(database_url)
        # Test connection
        await mongo_client.admin.command('ping')
        logger.info("Connected to MongoDB")
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB: {e}")
        raise

    # Initialize client manager
    max_clients = int(os.getenv("MAX_CLIENTS", "10"))
    client_manager = ClientManager(mongo_client, max_clients=max_clients)
    logger.info(f"Initialized ClientManager (max_clients={max_clients})")

    logger.info("Service started successfully")

    yield

    # Shutdown
    logger.info("Shutting down Discord Self-Bot Service...")

    # Stop all Discord clients
    if client_manager:
        await client_manager.stop_all_clients()

    # Close MongoDB connection
    if mongo_client:
        mongo_client.close()
        logger.info("MongoDB connection closed")

    logger.info("Service shutdown complete")


# Create FastAPI app
app = FastAPI(
    title="CartelBot Discord Self-Bot Service",
    description="Discord user account client for forwarding trading signals",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        os.getenv("NEXTJS_API_URL", "").rstrip("/api")
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response Models
class StartClientRequest(BaseModel):
    """Request to start a Discord client."""
    userId: str = Field(..., description="CartelBot user ID")
    connectionId: str = Field(..., description="Discord connection document ID")
    token: str = Field(..., description="Encrypted Discord token")
    serverId: str = Field(..., description="Discord server/guild ID")
    channelId: str = Field(..., description="Discord channel ID to monitor")


class StopClientRequest(BaseModel):
    """Request to stop a Discord client."""
    userId: str = Field(..., description="CartelBot user ID")


class ValidateTokenRequest(BaseModel):
    """Request to validate a Discord token."""
    token: str = Field(..., description="Discord user token to validate")


# API Endpoints
@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "CartelBot Discord Self-Bot Service",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """
    Health check endpoint.

    Returns 200 if healthy, 503 if unhealthy.
    """
    if not mongo_client or not client_manager:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "unhealthy",
                "error": "Service not initialized"
            }
        )

    active_clients = len(client_manager.clients)
    health_data = await check_health(mongo_client, active_clients)

    status_code = (
        status.HTTP_200_OK
        if health_data["status"] == "healthy"
        else status.HTTP_503_SERVICE_UNAVAILABLE
    )

    return JSONResponse(
        status_code=status_code,
        content=health_data
    )


@app.post("/client/start")
async def start_client(request: StartClientRequest):
    """
    Start a Discord client for a user.

    Connects to Discord using the provided token and monitors the specified
    channel for messages to forward to the Next.js API.
    """
    if not client_manager:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Client manager not initialized"
        )

    logger.info(f"Received start client request for user {request.userId}")

    result = await client_manager.start_client(
        user_id=request.userId,
        connection_id=request.connectionId,
        encrypted_token=request.token,
        server_id=request.serverId,
        channel_id=request.channelId
    )

    if not result["success"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.get("error", "Failed to start client")
        )

    return result


@app.post("/client/stop")
async def stop_client(request: StopClientRequest):
    """
    Stop a Discord client for a user.

    Disconnects the Discord client and cleans up resources.
    """
    if not client_manager:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Client manager not initialized"
        )

    logger.info(f"Received stop client request for user {request.userId}")

    result = await client_manager.stop_client(request.userId)

    if not result["success"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=result.get("error", "Client not found")
        )

    return result


@app.get("/client/status")
async def get_client_status(userId: Optional[str] = None):
    """
    Get status of Discord client(s).

    If userId is provided, returns status for that specific client.
    Otherwise, returns status for all clients.
    """
    if not client_manager:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Client manager not initialized"
        )

    if userId:
        client_status = client_manager.get_status(userId)
        if not client_status:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Client not found for user {userId}"
            )
        return client_status
    else:
        return {
            "activeClients": len(client_manager.clients),
            "maxClients": client_manager.max_clients,
            "clients": client_manager.get_all_statuses()
        }


@app.post("/token/validate")
async def validate_token(request: ValidateTokenRequest):
    """
    Validate a Discord user token using Discord's REST API with TLS fingerprinting.

    Uses tls_client (Go-based) which provides Chrome TLS/JA3 fingerprinting
    to avoid bot detection, without the Windows crashes of curl_cffi.

    Returns:
        - valid: True if token is valid, False otherwise
        - userId: Discord user ID (if valid)
        - username: Discord username (if valid)
        - discriminator: Discord discriminator (if valid)
        - error: Error message (if invalid)
    """
    logger.info("Received token validation request")

    # Validate token format (Discord tokens are typically 50-150 characters)
    token = request.token.strip() if request.token else ""
    if not token or len(token) < 50 or len(token) > 150:
        logger.warning("Token validation failed: Invalid token format")
        return {
            "success": False,
            "data": {"valid": False},
            "error": "Invalid token format"
        }

    # Strip "Bot " prefix if present (user tokens don't need it)
    if token.startswith("Bot "):
        token = token[4:]

    # Discord API endpoint
    discord_api_url = "https://discord.com/api/v10/users/@me"

    # Get anti-detection headers that mimic real Discord web client
    headers = get_discord_headers(token)

    try:
        # Use tls_client for Chrome TLS fingerprinting (sync, run in thread pool)
        def _validate_sync():
            session = create_tls_session()
            response = session.get(discord_api_url, headers=headers, timeout_seconds=10)
            return response

        # Run sync tls_client in thread pool to not block async event loop
        response = await asyncio.to_thread(_validate_sync)

        if response.status_code == 200:
            # Token is valid
            user_data = response.json()
            user_id = str(user_data.get("id", ""))
            username = user_data.get("username", "")
            discriminator = user_data.get("discriminator", "0")

            # Format username (Discord removed discriminators for most users)
            full_username = f"{username}#{discriminator}" if discriminator != "0" else username

            logger.info(f"Token validation successful: {full_username}")

            return {
                "success": True,
                "data": {
                    "valid": True,
                    "userId": user_id,
                    "username": username,
                    "discriminator": discriminator
                }
            }

        elif response.status_code == 401:
            # Invalid token
            logger.warning("Token validation failed: 401 Unauthorized")
            return {
                "success": False,
                "data": {"valid": False},
                "error": "Invalid Discord token"
            }

        elif response.status_code == 403:
            # Forbidden - token might be valid but account restricted
            logger.warning("Token validation failed: 403 Forbidden")
            return {
                "success": False,
                "data": {"valid": False},
                "error": "Account restricted or token lacks permissions"
            }

        elif response.status_code == 429:
            # Rate limited
            retry_after = response.headers.get("Retry-After", "unknown")
            logger.warning(f"Token validation rate limited. Retry after {retry_after}s")
            return {
                "success": False,
                "data": {"valid": False},
                "error": f"Rate limited. Retry after {retry_after} seconds"
            }

        else:
            # Other error - don't log response body (may contain sensitive data)
            logger.error(f"Token validation failed with status {response.status_code}")
            return {
                "success": False,
                "data": {"valid": False},
                "error": f"Discord API error: {response.status_code}"
            }

    except Exception as e:
        # Only log exception type, not full traceback (may contain sensitive data)
        logger.error(f"Unexpected error in token validation: {type(e).__name__}")
        return {
            "success": False,
            "data": {"valid": False},
            "error": "Internal error occurred"
        }


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))

    logger.info(f"Starting server on {host}:{port}")

    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=False,
        log_level=LOG_LEVEL.lower()
    )

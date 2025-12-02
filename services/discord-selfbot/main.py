"""
FastAPI server for Discord self-bot service.

This service connects to Discord as user accounts and forwards messages
to the CartelBot Next.js API for signal processing.
"""
import os
import logging
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

from client_manager import ClientManager
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

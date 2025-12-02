"""
Health check logic for monitoring service status.
"""
import time
import logging
from typing import Dict, Any
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)

# Track service start time
_start_time = time.time()


async def check_health(
    mongo_client: AsyncIOMotorClient,
    active_clients: int
) -> Dict[str, Any]:
    """
    Check service health status.

    Args:
        mongo_client: MongoDB async client instance
        active_clients: Number of active Discord clients

    Returns:
        Health status dictionary with status, uptime, metrics
    """
    uptime = time.time() - _start_time

    # Test MongoDB connection
    mongodb_connected = False
    try:
        # Ping MongoDB with 2 second timeout
        await mongo_client.admin.command('ping', maxTimeMS=2000)
        mongodb_connected = True
    except Exception as e:
        logger.error(f"MongoDB health check failed: {e}")

    # Determine overall health status
    is_healthy = mongodb_connected
    status = "healthy" if is_healthy else "unhealthy"

    health_data = {
        "status": status,
        "uptime_seconds": round(uptime, 2),
        "active_clients": active_clients,
        "mongodb_connected": mongodb_connected,
        "timestamp": time.time()
    }

    if not is_healthy:
        logger.warning(f"Service unhealthy: {health_data}")

    return health_data


def get_uptime() -> float:
    """Get service uptime in seconds."""
    return time.time() - _start_time


def reset_start_time():
    """Reset start time (for testing purposes)."""
    global _start_time
    _start_time = time.time()

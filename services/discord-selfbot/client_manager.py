"""
Multi-user Discord client manager with auto-reconnect.
"""
import os
import logging
import asyncio
from typing import Dict, Optional, Any
from datetime import datetime
import discord
from motor.motor_asyncio import AsyncIOMotorClient
from message_handler import MessageHandler
from encryption import decrypt_token

logger = logging.getLogger(__name__)


class ManagedClient:
    """Wrapper for Discord client with metadata."""

    def __init__(
        self,
        user_id: str,
        connection_id: str,
        client: discord.Client,
        handler: MessageHandler,
        server_id: str,
        channel_id: str
    ):
        self.user_id = user_id
        self.connection_id = connection_id
        self.client = client
        self.handler = handler
        self.server_id = server_id
        self.channel_id = channel_id
        self.started_at = datetime.utcnow()
        self.reconnect_count = 0
        self.last_error: Optional[str] = None

    def get_status(self) -> Dict[str, Any]:
        """Get client status information."""
        return {
            "userId": self.user_id,
            "connectionId": self.connection_id,
            "connected": not self.client.is_closed(),
            "serverId": self.server_id,
            "channelId": self.channel_id,
            "startedAt": self.started_at.isoformat(),
            "reconnectCount": self.reconnect_count,
            "lastError": self.last_error
        }


class ClientManager:
    """Manages multiple Discord self-bot clients for different users."""

    def __init__(
        self,
        mongo_client: AsyncIOMotorClient,
        max_clients: int = 10
    ):
        """
        Initialize client manager.

        Args:
            mongo_client: MongoDB async client
            max_clients: Maximum number of simultaneous clients
        """
        self.mongo_client = mongo_client
        self.max_clients = max_clients
        self.clients: Dict[str, ManagedClient] = {}
        self.min_delay = float(os.getenv("MESSAGE_DELAY_MIN", "1"))
        self.max_delay = float(os.getenv("MESSAGE_DELAY_MAX", "3"))

    async def start_client(
        self,
        user_id: str,
        connection_id: str,
        encrypted_token: str,
        server_id: str,
        channel_id: str
    ) -> Dict[str, Any]:
        """
        Start a Discord client for a user.

        Args:
            user_id: CartelBot user ID
            connection_id: Discord connection document ID
            encrypted_token: Encrypted Discord token
            server_id: Discord server/guild ID to monitor
            channel_id: Discord channel ID to monitor

        Returns:
            Status dictionary

        Raises:
            ValueError: If max clients reached or client already exists
        """
        # Check if client already exists
        if user_id in self.clients:
            logger.warning(f"Client for user {user_id} already exists")
            return {
                "success": False,
                "error": "Client already running for this user"
            }

        # Check max clients limit
        if len(self.clients) >= self.max_clients:
            logger.error(f"Max clients limit ({self.max_clients}) reached")
            return {
                "success": False,
                "error": f"Maximum client limit ({self.max_clients}) reached"
            }

        try:
            # Decrypt token
            token = decrypt_token(encrypted_token)

            # Create message handler
            handler = MessageHandler(
                mongo_client=self.mongo_client,
                user_id=user_id,
                connection_id=connection_id,
                monitored_channel_id=channel_id,
                min_delay=self.min_delay,
                max_delay=self.max_delay
            )

            # Create Discord client
            client = discord.Client()

            # Set up event handlers
            @client.event
            async def on_ready():
                logger.info(f"Discord client connected as {client.user} (user_id: {user_id})")

            @client.event
            async def on_message(message):
                await handler.on_message(message)

            @client.event
            async def on_disconnect():
                logger.warning(f"Discord client disconnected (user_id: {user_id})")

            @client.event
            async def on_error(event, *args, **kwargs):
                logger.error(f"Discord client error in {event} (user_id: {user_id})", exc_info=True)
                if user_id in self.clients:
                    self.clients[user_id].last_error = f"Error in {event}"

            # Create managed client
            managed = ManagedClient(
                user_id=user_id,
                connection_id=connection_id,
                client=client,
                handler=handler,
                server_id=server_id,
                channel_id=channel_id
            )

            # Store client
            self.clients[user_id] = managed

            # Start client in background
            asyncio.create_task(self._run_client_with_reconnect(user_id, token))

            logger.info(f"Started Discord client for user {user_id}")

            return {
                "success": True,
                "status": managed.get_status()
            }

        except ValueError as e:
            logger.error(f"Failed to start client for user {user_id}: {e}")
            return {
                "success": False,
                "error": str(e)
            }
        except Exception as e:
            logger.error(f"Unexpected error starting client for user {user_id}: {e}", exc_info=True)
            return {
                "success": False,
                "error": f"Internal error: {str(e)}"
            }

    async def _run_client_with_reconnect(self, user_id: str, token: str) -> None:
        """
        Run Discord client with auto-reconnect logic.

        Args:
            user_id: CartelBot user ID
            token: Decrypted Discord token
        """
        max_reconnect_attempts = 5
        base_delay = 5  # seconds

        while user_id in self.clients:
            managed = self.clients[user_id]

            try:
                await managed.client.start(token)
            except discord.LoginFailure:
                logger.error(f"Invalid Discord token for user {user_id}")
                managed.last_error = "Invalid token"
                await self.stop_client(user_id)
                break
            except Exception as e:
                logger.error(f"Discord client error for user {user_id}: {e}", exc_info=True)
                managed.last_error = str(e)
                managed.reconnect_count += 1

                # Check reconnect limit
                if managed.reconnect_count >= max_reconnect_attempts:
                    logger.error(
                        f"Max reconnect attempts ({max_reconnect_attempts}) reached for user {user_id}"
                    )
                    await self.stop_client(user_id)
                    break

                # Exponential backoff
                delay = base_delay * (2 ** (managed.reconnect_count - 1))
                logger.info(f"Reconnecting in {delay}s (attempt {managed.reconnect_count})")
                await asyncio.sleep(delay)

    async def stop_client(self, user_id: str) -> Dict[str, Any]:
        """
        Stop a Discord client.

        Args:
            user_id: CartelBot user ID

        Returns:
            Status dictionary
        """
        if user_id not in self.clients:
            return {
                "success": False,
                "error": "Client not found"
            }

        try:
            managed = self.clients[user_id]

            # Close Discord client
            if not managed.client.is_closed():
                await managed.client.close()

            # Remove from clients dict
            del self.clients[user_id]

            logger.info(f"Stopped Discord client for user {user_id}")

            return {
                "success": True,
                "message": "Client stopped successfully"
            }

        except Exception as e:
            logger.error(f"Error stopping client for user {user_id}: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }

    def get_status(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get status of a specific client.

        Args:
            user_id: CartelBot user ID

        Returns:
            Status dictionary or None if not found
        """
        if user_id not in self.clients:
            return None

        return self.clients[user_id].get_status()

    def get_all_statuses(self) -> Dict[str, Dict[str, Any]]:
        """
        Get status of all clients.

        Returns:
            Dictionary mapping user_id to status
        """
        return {
            user_id: managed.get_status()
            for user_id, managed in self.clients.items()
        }

    async def stop_all_clients(self) -> None:
        """Stop all running clients (for shutdown)."""
        user_ids = list(self.clients.keys())
        for user_id in user_ids:
            await self.stop_client(user_id)

        logger.info("All Discord clients stopped")

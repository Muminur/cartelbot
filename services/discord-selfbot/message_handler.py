"""
Discord message event handler with filtering and sanitization.
"""
import re
import logging
import asyncio
import random
from typing import Optional, Set
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
from signal_forwarder import get_forwarder

logger = logging.getLogger(__name__)


class MessageHandler:
    """Handles incoming Discord messages with filtering and forwarding."""

    def __init__(
        self,
        mongo_client: AsyncIOMotorClient,
        user_id: str,
        connection_id: str,
        monitored_channel_id: str,
        min_delay: float = 1.0,
        max_delay: float = 3.0
    ):
        """
        Initialize message handler.

        Args:
            mongo_client: MongoDB async client
            user_id: CartelBot user ID
            connection_id: Discord connection document ID
            monitored_channel_id: Discord channel ID to monitor
            min_delay: Minimum delay before processing (seconds)
            max_delay: Maximum delay before processing (seconds)
        """
        self.mongo_client = mongo_client
        self.user_id = user_id
        self.connection_id = connection_id
        self.monitored_channel_id = str(monitored_channel_id)
        self.min_delay = min_delay
        self.max_delay = max_delay
        self.forwarder = get_forwarder()
        self.db = mongo_client.cartelbot

        # Track processed message IDs to prevent duplicates
        self.processed_messages: Set[str] = set()

    async def on_message(self, message) -> None:
        """
        Handle incoming Discord message.

        Args:
            message: discord.Message object
        """
        try:
            # Filter 1: Check if message is from monitored channel
            if str(message.channel.id) != self.monitored_channel_id:
                return

            # Filter 2: Ignore bot messages (if author is a bot)
            if hasattr(message.author, 'bot') and message.author.bot:
                logger.debug(f"Ignoring bot message {message.id}")
                return

            # Filter 3: Check for duplicate (in-memory)
            message_id = str(message.id)
            if message_id in self.processed_messages:
                logger.debug(f"Duplicate message {message_id} (in-memory)")
                return

            # Filter 4: Check for duplicate in database
            is_duplicate = await self._check_duplicate_in_db(message_id)
            if is_duplicate:
                logger.debug(f"Duplicate message {message_id} (database)")
                self.processed_messages.add(message_id)
                return

            # Add random delay to appear more human-like
            delay = random.uniform(self.min_delay, self.max_delay)
            await asyncio.sleep(delay)

            # Sanitize message content
            sanitized_content = self._sanitize_content(message.content)

            # Build message payload
            message_data = {
                "userId": self.user_id,
                "connectionId": self.connection_id,
                "discordMessageId": message_id,
                "serverId": str(message.guild.id) if message.guild else None,
                "channelId": str(message.channel.id),
                "authorId": str(message.author.id),
                "authorUsername": str(message.author),
                "content": sanitized_content,
                "timestamp": message.created_at.isoformat()
            }

            logger.info(
                f"Processing message {message_id} from {message.author} "
                f"in channel {self.monitored_channel_id}"
            )

            # Forward to Next.js API
            success = await self.forwarder.forward_signal(message_data)

            if success:
                # Mark as processed
                self.processed_messages.add(message_id)

                # Store in database (for deduplication across restarts)
                await self._store_processed_message(message_id)
            else:
                logger.error(f"Failed to forward message {message_id}")

        except Exception as e:
            logger.error(f"Error handling message {message.id}: {e}", exc_info=True)

    async def _check_duplicate_in_db(self, message_id: str) -> bool:
        """
        Check if message was already processed (stored in database).

        Args:
            message_id: Discord message ID

        Returns:
            True if message was already processed
        """
        try:
            collection = self.db.discordMessages
            result = await collection.find_one({
                "connectionId": self.connection_id,
                "discordMessageId": message_id
            })
            return result is not None
        except Exception as e:
            logger.error(f"Database duplicate check failed: {e}")
            return False  # Assume not duplicate on error

    async def _store_processed_message(self, message_id: str) -> None:
        """
        Store processed message ID in database for deduplication.

        Args:
            message_id: Discord message ID
        """
        try:
            collection = self.db.discordMessages
            await collection.update_one(
                {
                    "connectionId": self.connection_id,
                    "discordMessageId": message_id
                },
                {
                    "$set": {
                        "userId": self.user_id,
                        "processedAt": datetime.utcnow()
                    }
                },
                upsert=True
            )
        except Exception as e:
            logger.error(f"Failed to store processed message {message_id}: {e}")

    @staticmethod
    def _sanitize_content(content: str) -> str:
        """
        Sanitize Discord message content by removing mentions, emojis, etc.

        Args:
            content: Raw message content

        Returns:
            Sanitized content
        """
        if not content:
            return ""

        # Remove user mentions: <@123456789>
        content = re.sub(r'<@!?\d+>', '', content)

        # Remove role mentions: <@&123456789>
        content = re.sub(r'<@&\d+>', '', content)

        # Remove channel mentions: <#123456789>
        content = re.sub(r'<#\d+>', '', content)

        # Remove custom emojis: <:name:123456789> or <a:name:123456789>
        content = re.sub(r'<a?:\w+:\d+>', '', content)

        # Remove @everyone and @here mentions
        content = content.replace('@everyone', '').replace('@here', '')

        # Clean up extra whitespace
        content = ' '.join(content.split())

        return content.strip()

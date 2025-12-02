"""
Forward Discord messages to Next.js API webhook.
"""
import os
import logging
import asyncio
from typing import Dict, Any, Optional
import aiohttp
from datetime import datetime

logger = logging.getLogger(__name__)


class SignalForwarder:
    """Handles forwarding Discord messages to Next.js API."""

    def __init__(
        self,
        api_url: Optional[str] = None,
        webhook_secret: Optional[str] = None,
        max_retries: int = 3,
        retry_delay: float = 1.0
    ):
        """
        Initialize signal forwarder.

        Args:
            api_url: Next.js API base URL
            webhook_secret: Secret for webhook authentication
            max_retries: Maximum number of retry attempts
            retry_delay: Delay between retries in seconds
        """
        self.api_url = api_url or os.getenv("NEXTJS_API_URL", "http://localhost:3000")
        self.webhook_secret = webhook_secret or os.getenv("NEXTJS_WEBHOOK_SECRET", "")
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.webhook_endpoint = f"{self.api_url}/api/discord/webhook/message"

        if not self.webhook_secret:
            logger.warning("NEXTJS_WEBHOOK_SECRET not set - webhook authentication disabled")

    async def forward_signal(self, message_data: Dict[str, Any]) -> bool:
        """
        Forward message to Next.js API with retry logic.

        Args:
            message_data: Message payload containing:
                - userId: CartelBot user ID
                - connectionId: Discord connection ID
                - discordMessageId: Discord message ID
                - serverId: Discord server/guild ID
                - channelId: Discord channel ID
                - authorId: Discord message author ID
                - authorUsername: Discord message author username
                - content: Message content (sanitized)
                - timestamp: Message timestamp (ISO format)

        Returns:
            True if forwarding succeeded, False otherwise
        """
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "CartelBot-Discord-Service/1.0"
        }

        # Add webhook secret for authentication
        if self.webhook_secret:
            headers["X-Webhook-Secret"] = self.webhook_secret

        # Ensure timestamp is ISO format string
        if isinstance(message_data.get("timestamp"), datetime):
            message_data["timestamp"] = message_data["timestamp"].isoformat()

        for attempt in range(1, self.max_retries + 1):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        self.webhook_endpoint,
                        json=message_data,
                        headers=headers,
                        timeout=aiohttp.ClientTimeout(total=10)
                    ) as response:
                        if response.status == 200:
                            logger.info(
                                f"Successfully forwarded message {message_data.get('discordMessageId')} "
                                f"to Next.js API"
                            )
                            return True
                        elif response.status == 401:
                            logger.error("Webhook authentication failed - invalid secret")
                            return False
                        else:
                            error_text = await response.text()
                            logger.warning(
                                f"Forward attempt {attempt}/{self.max_retries} failed: "
                                f"HTTP {response.status} - {error_text}"
                            )

            except asyncio.TimeoutError:
                logger.warning(
                    f"Forward attempt {attempt}/{self.max_retries} timed out after 10s"
                )
            except aiohttp.ClientError as e:
                logger.warning(
                    f"Forward attempt {attempt}/{self.max_retries} failed: {e}"
                )
            except Exception as e:
                logger.error(
                    f"Unexpected error during forward attempt {attempt}/{self.max_retries}: {e}",
                    exc_info=True
                )

            # Wait before retry (except on last attempt)
            if attempt < self.max_retries:
                await asyncio.sleep(self.retry_delay * attempt)  # Exponential backoff

        logger.error(
            f"Failed to forward message {message_data.get('discordMessageId')} "
            f"after {self.max_retries} attempts"
        )
        return False


# Global forwarder instance
_forwarder: Optional[SignalForwarder] = None


def get_forwarder() -> SignalForwarder:
    """Get or create global signal forwarder instance."""
    global _forwarder
    if _forwarder is None:
        _forwarder = SignalForwarder()
    return _forwarder

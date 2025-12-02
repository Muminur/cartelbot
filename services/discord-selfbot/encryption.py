"""
Token encryption/decryption utilities using Fernet symmetric encryption.
"""
import os
import logging
from typing import Optional
from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)


class EncryptionManager:
    """Handles encryption and decryption of sensitive data like Discord tokens."""

    def __init__(self, encryption_key: Optional[str] = None):
        """
        Initialize encryption manager with Fernet key.

        Args:
            encryption_key: Base64-encoded Fernet key. If None, reads from ENCRYPTION_KEY env var.
        """
        key = encryption_key or os.getenv("ENCRYPTION_KEY")
        if not key:
            raise ValueError("ENCRYPTION_KEY not provided and not found in environment")

        try:
            self.cipher = Fernet(key.encode() if isinstance(key, str) else key)
        except Exception as e:
            logger.error(f"Failed to initialize Fernet cipher: {e}")
            raise ValueError(f"Invalid encryption key format: {e}")

    def encrypt_token(self, token: str) -> str:
        """
        Encrypt a Discord token.

        Args:
            token: Plain text Discord token

        Returns:
            Base64-encoded encrypted token

        Raises:
            ValueError: If encryption fails
        """
        try:
            encrypted_bytes = self.cipher.encrypt(token.encode())
            return encrypted_bytes.decode()
        except Exception as e:
            logger.error(f"Token encryption failed: {e}")
            raise ValueError(f"Failed to encrypt token: {e}")

    def decrypt_token(self, encrypted_token: str) -> str:
        """
        Decrypt a Discord token.

        Args:
            encrypted_token: Base64-encoded encrypted token

        Returns:
            Plain text Discord token

        Raises:
            ValueError: If decryption fails or token is invalid
        """
        try:
            decrypted_bytes = self.cipher.decrypt(encrypted_token.encode())
            return decrypted_bytes.decode()
        except InvalidToken:
            logger.error("Invalid token or encryption key mismatch")
            raise ValueError("Failed to decrypt token: Invalid token or key")
        except Exception as e:
            logger.error(f"Token decryption failed: {e}")
            raise ValueError(f"Failed to decrypt token: {e}")


# Global encryption manager instance
_encryption_manager: Optional[EncryptionManager] = None


def get_encryption_manager() -> EncryptionManager:
    """Get or create global encryption manager instance."""
    global _encryption_manager
    if _encryption_manager is None:
        _encryption_manager = EncryptionManager()
    return _encryption_manager


def encrypt_token(token: str) -> str:
    """Convenience function to encrypt a token."""
    return get_encryption_manager().encrypt_token(token)


def decrypt_token(encrypted_token: str) -> str:
    """Convenience function to decrypt a token."""
    return get_encryption_manager().decrypt_token(encrypted_token)

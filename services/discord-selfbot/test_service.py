"""
Unit tests for Discord Self-Bot Service.

Run with: pytest test_service.py -v
"""
import os
import sys
import json
import pytest
import asyncio
from unittest.mock import Mock, patch, AsyncMock, MagicMock
from datetime import datetime

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


# ============================================================================
# Test Fixtures
# ============================================================================

@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def encryption_key():
    """Generate a valid Fernet key for testing."""
    from cryptography.fernet import Fernet
    return Fernet.generate_key().decode()


@pytest.fixture
def sample_token():
    """Sample Discord token format."""
    return "MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.GP-abc.xyz123-sample-token"


@pytest.fixture
def sample_message_data():
    """Sample message payload for forwarding."""
    return {
        "userId": "user123",
        "connectionId": "conn456",
        "discordMessageId": "msg789",
        "serverId": "server123",
        "channelId": "channel456",
        "authorId": "author789",
        "authorUsername": "TestUser#1234",
        "content": "Buying $BTC Entry: 45000 Target: 50000 SL: 42000",
        "timestamp": datetime.utcnow().isoformat()
    }


# ============================================================================
# Encryption Tests
# ============================================================================

class TestEncryption:
    """Tests for encryption.py module."""

    def test_encrypt_token_returns_encrypted_string(self, encryption_key, sample_token):
        """Test that encryption returns a different string."""
        with patch.dict(os.environ, {"ENCRYPTION_KEY": encryption_key}):
            # Clear module cache to reload with new env
            if "encryption" in sys.modules:
                del sys.modules["encryption"]

            from encryption import encrypt_token
            encrypted = encrypt_token(sample_token)

            assert encrypted != sample_token
            assert isinstance(encrypted, str)
            assert len(encrypted) > len(sample_token)

    def test_decrypt_token_returns_original(self, encryption_key, sample_token):
        """Test that decryption returns the original token."""
        with patch.dict(os.environ, {"ENCRYPTION_KEY": encryption_key}):
            if "encryption" in sys.modules:
                del sys.modules["encryption"]

            from encryption import encrypt_token, decrypt_token
            encrypted = encrypt_token(sample_token)
            decrypted = decrypt_token(encrypted)

            assert decrypted == sample_token

    def test_encrypt_decrypt_roundtrip_various_tokens(self, encryption_key):
        """Test roundtrip with various token formats."""
        test_tokens = [
            "short",
            "a" * 100,  # Long token
            "special!@#$%^&*()_+-=[]{}|;':\",./<>?",
            "unicode-тест-🚀",
            "MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.GP-abc.xyz123",
        ]

        with patch.dict(os.environ, {"ENCRYPTION_KEY": encryption_key}):
            if "encryption" in sys.modules:
                del sys.modules["encryption"]

            from encryption import encrypt_token, decrypt_token

            for token in test_tokens:
                encrypted = encrypt_token(token)
                decrypted = decrypt_token(encrypted)
                assert decrypted == token, f"Failed for token: {token}"

    def test_invalid_encrypted_token_raises_error(self, encryption_key):
        """Test that invalid encrypted token raises ValueError."""
        with patch.dict(os.environ, {"ENCRYPTION_KEY": encryption_key}):
            if "encryption" in sys.modules:
                del sys.modules["encryption"]

            from encryption import decrypt_token

            with pytest.raises(ValueError) as exc_info:
                decrypt_token("invalid-encrypted-token")

            assert "Failed to decrypt" in str(exc_info.value)

    def test_missing_encryption_key_raises_error(self):
        """Test that missing ENCRYPTION_KEY raises ValueError."""
        with patch.dict(os.environ, {}, clear=True):
            # Remove ENCRYPTION_KEY if it exists
            os.environ.pop("ENCRYPTION_KEY", None)

            if "encryption" in sys.modules:
                del sys.modules["encryption"]

            with pytest.raises(ValueError) as exc_info:
                from encryption import get_encryption_manager
                get_encryption_manager()

            assert "ENCRYPTION_KEY" in str(exc_info.value)

    def test_encrypted_tokens_are_unique(self, encryption_key, sample_token):
        """Test that encrypting same token produces different ciphertext (Fernet uses random IV)."""
        with patch.dict(os.environ, {"ENCRYPTION_KEY": encryption_key}):
            if "encryption" in sys.modules:
                del sys.modules["encryption"]

            from encryption import encrypt_token

            encrypted1 = encrypt_token(sample_token)
            encrypted2 = encrypt_token(sample_token)

            # Due to Fernet's random IV, same plaintext produces different ciphertext
            assert encrypted1 != encrypted2


# ============================================================================
# Signal Forwarder Tests
# ============================================================================

class TestSignalForwarder:
    """Tests for signal_forwarder.py module."""

    @pytest.mark.asyncio
    async def test_successful_forwarding_returns_true(self, sample_message_data):
        """Test that successful HTTP 200 response returns True."""
        with patch.dict(os.environ, {
            "NEXTJS_API_URL": "http://localhost:3000",
            "NEXTJS_WEBHOOK_SECRET": "test-secret"
        }):
            if "signal_forwarder" in sys.modules:
                del sys.modules["signal_forwarder"]

            from signal_forwarder import SignalForwarder

            forwarder = SignalForwarder()

            # Mock aiohttp
            with patch("aiohttp.ClientSession") as mock_session:
                mock_response = AsyncMock()
                mock_response.status = 200
                mock_response.__aenter__ = AsyncMock(return_value=mock_response)
                mock_response.__aexit__ = AsyncMock()

                mock_post = AsyncMock(return_value=mock_response)
                mock_session_instance = MagicMock()
                mock_session_instance.post = mock_post
                mock_session_instance.__aenter__ = AsyncMock(return_value=mock_session_instance)
                mock_session_instance.__aexit__ = AsyncMock()
                mock_session.return_value = mock_session_instance

                result = await forwarder.forward_signal(sample_message_data)

                assert result is True

    @pytest.mark.asyncio
    async def test_401_unauthorized_stops_retries(self, sample_message_data):
        """Test that 401 response stops retries immediately."""
        with patch.dict(os.environ, {
            "NEXTJS_API_URL": "http://localhost:3000",
            "NEXTJS_WEBHOOK_SECRET": "test-secret"
        }):
            if "signal_forwarder" in sys.modules:
                del sys.modules["signal_forwarder"]

            from signal_forwarder import SignalForwarder

            forwarder = SignalForwarder(max_retries=3)

            with patch("aiohttp.ClientSession") as mock_session:
                mock_response = AsyncMock()
                mock_response.status = 401
                mock_response.text = AsyncMock(return_value="Unauthorized")
                mock_response.__aenter__ = AsyncMock(return_value=mock_response)
                mock_response.__aexit__ = AsyncMock()

                mock_post = AsyncMock(return_value=mock_response)
                mock_session_instance = MagicMock()
                mock_session_instance.post = mock_post
                mock_session_instance.__aenter__ = AsyncMock(return_value=mock_session_instance)
                mock_session_instance.__aexit__ = AsyncMock()
                mock_session.return_value = mock_session_instance

                result = await forwarder.forward_signal(sample_message_data)

                assert result is False
                # Verify only called once (no retries for 401)
                assert mock_post.call_count == 1


# ============================================================================
# Message Handler Tests
# ============================================================================

class TestMessageHandler:
    """Tests for message_handler.py module - specifically the sanitize function."""

    def get_sanitize_function(self):
        """Get the _sanitize_content static method."""
        if "message_handler" in sys.modules:
            del sys.modules["message_handler"]

        from message_handler import MessageHandler
        return MessageHandler._sanitize_content

    def test_sanitize_removes_user_mentions(self):
        """Test removal of user mentions <@123456789>."""
        sanitize = self.get_sanitize_function()

        result = sanitize("Hello <@123456789> check this signal")
        assert "<@" not in result
        assert "Hello  check this signal" == result or "Hello check this signal" == result

    def test_sanitize_removes_user_mentions_with_exclamation(self):
        """Test removal of user mentions with ! <@!123456789>."""
        sanitize = self.get_sanitize_function()

        result = sanitize("Hey <@!987654321> buying $BTC")
        assert "<@!" not in result
        assert "buying $BTC" in result

    def test_sanitize_removes_role_mentions(self):
        """Test removal of role mentions <@&123456789>."""
        sanitize = self.get_sanitize_function()

        result = sanitize("<@&111222333> New signal alert!")
        assert "<@&" not in result
        assert "New signal alert!" in result

    def test_sanitize_removes_channel_mentions(self):
        """Test removal of channel mentions <#123456789>."""
        sanitize = self.get_sanitize_function()

        result = sanitize("Check <#444555666> for details")
        assert "<#" not in result
        assert "Check  for details" == result or "Check for details" == result

    def test_sanitize_removes_custom_emojis(self):
        """Test removal of custom emojis <:name:123456789>."""
        sanitize = self.get_sanitize_function()

        result = sanitize("Great trade <:pepehappy:123456> congrats!")
        assert "<:" not in result
        assert ":>" not in result

    def test_sanitize_removes_animated_emojis(self):
        """Test removal of animated emojis <a:name:123456789>."""
        sanitize = self.get_sanitize_function()

        result = sanitize("Profit! <a:partyblob:789456> yes!")
        assert "<a:" not in result

    def test_sanitize_removes_everyone_mention(self):
        """Test removal of @everyone."""
        sanitize = self.get_sanitize_function()

        result = sanitize("@everyone New signal incoming!")
        assert "@everyone" not in result
        assert "New signal incoming!" in result

    def test_sanitize_removes_here_mention(self):
        """Test removal of @here."""
        sanitize = self.get_sanitize_function()

        result = sanitize("@here Check this trade now!")
        assert "@here" not in result
        assert "Check this trade now!" in result

    def test_sanitize_handles_empty_string(self):
        """Test handling of empty string."""
        sanitize = self.get_sanitize_function()

        result = sanitize("")
        assert result == ""

    def test_sanitize_handles_none(self):
        """Test handling of None input."""
        sanitize = self.get_sanitize_function()

        result = sanitize(None)
        assert result == ""

    def test_sanitize_preserves_signal_content(self):
        """Test that trading signal data is preserved."""
        sanitize = self.get_sanitize_function()

        signal = "Buying $BTC Entry: 45000 Target: 50000 SL: 42000"
        result = sanitize(signal)

        assert "$BTC" in result
        assert "45000" in result
        assert "50000" in result
        assert "42000" in result

    def test_sanitize_multiple_mentions_combined(self):
        """Test removal of multiple mention types in one message."""
        sanitize = self.get_sanitize_function()

        message = "@everyone <@123> <@&456> <#789> <:emoji:111> Check <a:animated:222> now!"
        result = sanitize(message)

        assert "@everyone" not in result
        assert "<@" not in result
        assert "<@&" not in result
        assert "<#" not in result
        assert "<:" not in result
        assert "<a:" not in result
        assert "Check" in result
        assert "now!" in result

    def test_sanitize_cleans_extra_whitespace(self):
        """Test that extra whitespace is cleaned."""
        sanitize = self.get_sanitize_function()

        result = sanitize("Hello    world   test")
        assert result == "Hello world test"


# ============================================================================
# Health Check Tests
# ============================================================================

class TestHealth:
    """Tests for health.py module."""

    @pytest.mark.asyncio
    async def test_healthy_response_format(self):
        """Test that healthy response has correct format."""
        if "health" in sys.modules:
            del sys.modules["health"]

        from health import check_health

        # Mock MongoDB client
        mock_mongo = AsyncMock()
        mock_mongo.admin.command = AsyncMock(return_value={"ok": 1})

        result = await check_health(mock_mongo, active_clients=2)

        assert "status" in result
        assert result["status"] == "healthy"
        assert "active_clients" in result
        assert result["active_clients"] == 2

    @pytest.mark.asyncio
    async def test_healthy_response_includes_service_info(self):
        """Test that response includes service info."""
        if "health" in sys.modules:
            del sys.modules["health"]

        from health import check_health

        mock_mongo = AsyncMock()
        mock_mongo.admin.command = AsyncMock(return_value={"ok": 1})

        result = await check_health(mock_mongo, active_clients=0)

        assert "uptime_seconds" in result
        assert "mongodb_connected" in result
        assert result["mongodb_connected"] is True

    @pytest.mark.asyncio
    async def test_unhealthy_response_on_mongodb_failure(self):
        """Test unhealthy status when MongoDB fails."""
        if "health" in sys.modules:
            del sys.modules["health"]

        from health import check_health

        mock_mongo = AsyncMock()
        mock_mongo.admin.command = AsyncMock(side_effect=Exception("Connection failed"))

        result = await check_health(mock_mongo, active_clients=0)

        assert result["status"] == "unhealthy"
        assert result["mongodb_connected"] is False

    @pytest.mark.asyncio
    async def test_health_response_is_json_serializable(self):
        """Test that response can be serialized to JSON."""
        if "health" in sys.modules:
            del sys.modules["health"]

        from health import check_health

        mock_mongo = AsyncMock()
        mock_mongo.admin.command = AsyncMock(return_value={"ok": 1})

        result = await check_health(mock_mongo, active_clients=1)

        # Should not raise
        json_str = json.dumps(result)
        assert isinstance(json_str, str)

    @pytest.mark.asyncio
    async def test_health_includes_mongodb_status(self):
        """Test that response includes MongoDB connection status."""
        if "health" in sys.modules:
            del sys.modules["health"]

        from health import check_health

        mock_mongo = AsyncMock()
        mock_mongo.admin.command = AsyncMock(return_value={"ok": 1})

        result = await check_health(mock_mongo, active_clients=3)

        assert "mongodb_connected" in result
        assert isinstance(result["mongodb_connected"], bool)


# ============================================================================
# Integration Tests
# ============================================================================

class TestIntegration:
    """Integration tests combining multiple modules."""

    def test_encrypt_forward_flow(self, encryption_key, sample_token):
        """Test encryption followed by forward preparation."""
        with patch.dict(os.environ, {
            "ENCRYPTION_KEY": encryption_key,
            "NEXTJS_API_URL": "http://localhost:3000",
            "NEXTJS_WEBHOOK_SECRET": "test-secret"
        }):
            # Clear modules
            for mod in ["encryption", "signal_forwarder"]:
                if mod in sys.modules:
                    del sys.modules[mod]

            from encryption import encrypt_token, decrypt_token
            from signal_forwarder import SignalForwarder

            # Encrypt token
            encrypted = encrypt_token(sample_token)

            # Verify we can decrypt
            decrypted = decrypt_token(encrypted)
            assert decrypted == sample_token

            # Verify forwarder can be initialized
            forwarder = SignalForwarder()
            assert forwarder.webhook_endpoint == "http://localhost:3000/api/discord/webhook/message"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

"""
Utility script to generate encryption keys and secrets for Discord Self-Bot Service.
"""
import secrets
from cryptography.fernet import Fernet


def generate_fernet_key() -> str:
    """Generate a Fernet encryption key."""
    return Fernet.generate_key().decode()


def generate_webhook_secret(length: int = 32) -> str:
    """Generate a webhook secret."""
    return secrets.token_hex(length)


def main():
    """Generate and display keys."""
    print("=" * 70)
    print("Discord Self-Bot Service - Key Generation")
    print("=" * 70)

    # Generate Fernet encryption key
    fernet_key = generate_fernet_key()
    print("\n[ENCRYPTION_KEY] - Add to .env file:")
    print(f"ENCRYPTION_KEY={fernet_key}")

    # Generate webhook secret
    webhook_secret = generate_webhook_secret()
    print("\n[NEXTJS_WEBHOOK_SECRET] - Add to .env file AND Next.js .env:")
    print(f"NEXTJS_WEBHOOK_SECRET={webhook_secret}")

    print("\n" + "=" * 70)
    print("IMPORTANT:")
    print("1. Copy these values to your .env file")
    print("2. Add NEXTJS_WEBHOOK_SECRET to Next.js .env.local file")
    print("3. Keep these keys secure - never commit to git")
    print("4. Generate new keys for each environment (dev/staging/prod)")
    print("=" * 70)


if __name__ == "__main__":
    main()

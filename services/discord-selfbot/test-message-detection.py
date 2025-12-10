"""
Diagnostic script to test Discord message detection.

This script sends a test message to the Python service's webhook endpoint
to verify the entire message processing pipeline.
"""
import asyncio
import aiohttp
import os
import json
from datetime import datetime


async def test_webhook():
    """Test the webhook endpoint with a sample Discord message."""

    # Load environment variables
    from dotenv import load_dotenv
    load_dotenv()

    webhook_url = "http://localhost:3000/api/discord/webhook/message"
    webhook_secret = os.getenv("NEXTJS_WEBHOOK_SECRET")

    if not webhook_secret:
        print("❌ NEXTJS_WEBHOOK_SECRET not set in .env")
        return

    # Sample Discord message payload
    test_message = {
        "userId": "6911d21a06ca4503b48afe7a",
        "connectionId": "69396c9cc3eb7d481fab273d",
        "discordMessageId": f"TEST_{int(datetime.utcnow().timestamp())}",
        "serverId": "1446751684822044735",
        "channelId": "1446751758196932689",
        "authorId": "123456789",
        "authorUsername": "TestUser#0000",
        "content": "Buying $BTC\nEntry: 96000\nTargets: 98000, 100000\nSL: 94000",
        "timestamp": datetime.utcnow().isoformat()
    }

    print("=" * 80)
    print("Discord Message Detection Test")
    print("=" * 80)
    print(f"\nTest Message:")
    print(json.dumps(test_message, indent=2))
    print(f"\nWebhook URL: {webhook_url}")
    print(f"Webhook Secret: {webhook_secret[:10]}...")
    print("\n" + "=" * 80)

    headers = {
        "Content-Type": "application/json",
        "X-Webhook-Secret": webhook_secret
    }

    try:
        async with aiohttp.ClientSession() as session:
            print("\n📡 Sending test message to webhook...")
            async with session.post(
                webhook_url,
                json=test_message,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=30)
            ) as response:
                status = response.status
                try:
                    data = await response.json()
                except:
                    data = await response.text()

                print(f"\n✅ Response Status: {status}")
                print(f"Response Body:")
                print(json.dumps(data, indent=2) if isinstance(data, dict) else data)

                if status == 200:
                    print("\n✅ SUCCESS: Message processed successfully!")
                    print("\nNext steps:")
                    print("1. Check MongoDB discordMessages collection for the message")
                    print("2. Check signals collection for parsed signal")
                    print("3. Check trades collection for trade execution")
                else:
                    print(f"\n❌ FAILED: Webhook returned status {status}")

    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()


async def check_discord_client_status():
    """Check the Discord client status in Python service."""
    print("\n" + "=" * 80)
    print("Discord Client Status Check")
    print("=" * 80)

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                "http://localhost:8000/client/status?userId=6911d21a06ca4503b48afe7a"
            ) as response:
                data = await response.json()

                print("\nClient Status:")
                print(json.dumps(data, indent=2))

                if data.get("connected"):
                    print("\n✅ Discord client is CONNECTED")
                else:
                    print("\n❌ Discord client is DISCONNECTED")

                if data.get("lastError"):
                    print(f"\n⚠️  Last Error: {data['lastError']}")

                if data.get("reconnectCount", 0) > 0:
                    print(f"⚠️  Reconnect Count: {data['reconnectCount']}")
                    print("   This indicates connection issues!")

    except Exception as e:
        print(f"\n❌ ERROR checking client status: {e}")


async def main():
    """Run all diagnostic tests."""
    print("\n" + "=" * 80)
    print("DISCORD MESSAGE DETECTION DIAGNOSTIC TOOL")
    print("=" * 80)

    # Check client status first
    await check_discord_client_status()

    # Test webhook
    print("\n")
    await test_webhook()

    print("\n" + "=" * 80)
    print("DIAGNOSTIC COMPLETE")
    print("=" * 80)
    print("\nInterpretation:")
    print("1. If client shows 'connected: true' but has TLS errors → Discord library connection issue")
    print("2. If webhook test succeeds → Message processing pipeline is working")
    print("3. If webhook test fails → Check Next.js API logs and MongoDB connection")
    print("\nIf client is connected but messages aren't detected:")
    print("- The Discord client may not be receiving on_message events")
    print("- Event handlers may not be properly registered")
    print("- The service needs to be restarted to apply code changes")
    print("=" * 80 + "\n")


if __name__ == "__main__":
    asyncio.run(main())

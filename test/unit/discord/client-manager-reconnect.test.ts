/**
 * Unit tests for Discord Client Manager Reconnect Logic
 *
 * Tests the runClientWithReconnect method to verify:
 * 1. BUG DEMONSTRATION: Successful login immediately re-logs in (THE BUG)
 * 2. Login timeout handling and immediate stop
 * 3. Exponential backoff retry logic
 * 4. Max reconnect attempts enforcement
 *
 * NOTE: Tests for "disconnect wait mechanism" are omitted because the current
 * implementation doesn't support it (that's the bug we're fixing).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";

// Mock discord.js-selfbot-v13 BEFORE importing the manager
vi.mock("discord.js-selfbot-v13", () => {
  const { EventEmitter } = require("events");

  class MockClient extends EventEmitter {
    user: { tag: string; bot: boolean } | null = null;
    readyAt: Date | null = null;

    async login(token: string): Promise<string> {
      // Default successful login - will be overridden in tests
      this.user = { tag: "TestUser#1234", bot: false };
      this.readyAt = new Date();
      this.emit("ready");
      return token;
    }

    async destroy(): Promise<void> {
      this.user = null;
      this.readyAt = null;
      this.removeAllListeners();
    }
  }

  return { Client: MockClient };
});

// Mock encryption module
vi.mock("@/lib/encryption", () => ({
  encrypt: (data: string) => `encrypted_${data}`,
  decrypt: (data: string) => data.replace("encrypted_", ""),
}));

// Mock message handler
vi.mock("@/lib/discord/message-handler", () => ({
  DiscordMessageHandler: class {
    constructor() {}
    async onMessage() {}
    destroy() {}
  },
}));

// Now import after mocks are set up
import { DiscordClientManager } from "@/lib/discord/client-manager";
import { Client } from "discord.js-selfbot-v13";

describe("DiscordClientManager - Reconnect Logic", () => {
  let manager: DiscordClientManager;
  const userId = "test-user-123";
  const connectionId = "test-connection-456";
  // Valid length token (50-150 chars) to pass validation
  const token = "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkw";
  const serverId = "server-789";
  const channelId = "channel-012";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Get fresh instance
    manager = DiscordClientManager.getInstance();
  });

  afterEach(async () => {
    // Cleanup all clients
    await manager.stopAllClients();
    vi.useRealTimers();
  });

  describe("1. FIX VERIFICATION - Wait for Disconnect Before Re-Login", () => {
    it("FIXED: After successful login, should NOT re-login until disconnect event", async () => {
      const loginSpy = vi.spyOn(Client.prototype, "login").mockImplementation(async function (this: any, tkn: string) {
        this.user = { tag: "TestUser#1234", bot: false };
        this.readyAt = new Date();
        setImmediate(() => this.emit("ready"));
        return tkn;
      });

      const result = await manager.startClient(userId, connectionId, token, serverId, channelId);
      expect(result.success).toBe(true);

      // Wait for initial login
      await vi.advanceTimersByTimeAsync(100);

      // FIXED: Only 1 login call - loop waits for disconnect
      expect(loginSpy).toHaveBeenCalledTimes(1);

      // Client stays connected
      expect(manager.getStatus(userId)?.connected).toBe(true);

      loginSpy.mockRestore();
    });
  });

  describe("2. Login Timeout Handling", () => {
    it("should stop client immediately on login timeout (30s) without retry", async () => {
      const loginSpy = vi.spyOn(Client.prototype, "login").mockImplementation(() => {
        // Never resolve - will timeout after 30s
        return new Promise(() => {});
      });

      const result = await manager.startClient(userId, connectionId, token, serverId, channelId);
      expect(result.success).toBe(true);

      // Advance to trigger 30s timeout
      await vi.advanceTimersByTimeAsync(30000);

      // Wait for error handler to execute
      await vi.advanceTimersByTimeAsync(100);

      // Client should be stopped (removed from map)
      expect(manager.getStatus(userId)).toBeNull();

      // Login should only be called once (no retry after timeout)
      expect(loginSpy).toHaveBeenCalledTimes(1);

      loginSpy.mockRestore();
    });

    it("should stop immediately on TOKEN_INVALID error without retry", async () => {
      const loginSpy = vi.spyOn(Client.prototype, "login").mockImplementation(() => {
        return Promise.reject(new Error("TOKEN_INVALID"));
      });

      const result = await manager.startClient(userId, connectionId, token, serverId, channelId);
      expect(result.success).toBe(true);

      await vi.advanceTimersByTimeAsync(100);

      // Client should be stopped
      expect(manager.getStatus(userId)).toBeNull();

      // Login should only be called once (no retry on invalid token)
      expect(loginSpy).toHaveBeenCalledTimes(1);

      loginSpy.mockRestore();
    });

    it("should retry network errors with exponential backoff then stay connected", async () => {
      let attemptCount = 0;

      const loginSpy = vi.spyOn(Client.prototype, "login").mockImplementation(async function (this: any) {
        attemptCount++;
        if (attemptCount <= 2) {
          return Promise.reject(new Error("Network error"));
        }
        // Third attempt succeeds
        this.user = { tag: "TestUser#1234", bot: false };
        this.readyAt = new Date();
        setImmediate(() => this.emit("ready"));
        return token;
      });

      const result = await manager.startClient(userId, connectionId, token, serverId, channelId);
      expect(result.success).toBe(true);

      // First attempt fails immediately
      await vi.advanceTimersByTimeAsync(100);
      expect(loginSpy).toHaveBeenCalledTimes(1);

      // Wait for first retry (5s backoff)
      await vi.advanceTimersByTimeAsync(5000);
      expect(loginSpy).toHaveBeenCalledTimes(2);

      // Wait for second retry (10s backoff)
      await vi.advanceTimersByTimeAsync(10000);
      await vi.advanceTimersByTimeAsync(100);

      // FIXED: Only 3 login calls - loop waits for disconnect after success
      expect(loginSpy).toHaveBeenCalledTimes(3);

      expect(manager.getStatus(userId)?.connected).toBe(true);

      loginSpy.mockRestore();
    });
  });

  describe("3. Exponential Backoff Logic", () => {
    it("should use exponential backoff capped at 30s: 5s, 10s, 20s, 30s", async () => {
      let attemptCount = 0;

      const loginSpy = vi.spyOn(Client.prototype, "login").mockImplementation(() => {
        attemptCount++;
        return Promise.reject(new Error("Network error"));
      });

      const result = await manager.startClient(userId, connectionId, token, serverId, channelId);
      expect(result.success).toBe(true);

      // First attempt (immediate)
      await vi.advanceTimersByTimeAsync(100);
      expect(loginSpy).toHaveBeenCalledTimes(1);

      // First retry after 5s (baseDelay * 2^0)
      await vi.advanceTimersByTimeAsync(5000);
      expect(loginSpy).toHaveBeenCalledTimes(2);

      // Second retry after 10s (baseDelay * 2^1)
      await vi.advanceTimersByTimeAsync(10000);
      expect(loginSpy).toHaveBeenCalledTimes(3);

      // Third retry after 20s (baseDelay * 2^2)
      await vi.advanceTimersByTimeAsync(20000);
      expect(loginSpy).toHaveBeenCalledTimes(4);

      // Fourth retry after 30s (baseDelay * 2^3 = 40s, capped at 30s)
      await vi.advanceTimersByTimeAsync(30000);
      expect(loginSpy).toHaveBeenCalledTimes(5);

      // Max attempts reached - client should be stopped
      await vi.advanceTimersByTimeAsync(100);
      expect(manager.getStatus(userId)).toBeNull();

      loginSpy.mockRestore();
    });

    it("should stop after 5 reconnect attempts", async () => {
      const loginSpy = vi.spyOn(Client.prototype, "login").mockImplementation(() => {
        return Promise.reject(new Error("Persistent network error"));
      });

      const result = await manager.startClient(userId, connectionId, token, serverId, channelId);
      expect(result.success).toBe(true);

      // Initial attempt
      await vi.advanceTimersByTimeAsync(100);

      // Retry 1 (5s)
      await vi.advanceTimersByTimeAsync(5000);
      // Retry 2 (10s)
      await vi.advanceTimersByTimeAsync(10000);
      // Retry 3 (20s)
      await vi.advanceTimersByTimeAsync(20000);
      // Retry 4 (30s)
      await vi.advanceTimersByTimeAsync(30000);

      // Total 5 attempts = max limit reached
      expect(loginSpy).toHaveBeenCalledTimes(5);

      // Client should be removed after max attempts
      await vi.advanceTimersByTimeAsync(100);
      expect(manager.getStatus(userId)).toBeNull();

      loginSpy.mockRestore();
    });

    it("should remove client from map after max attempts exceeded", async () => {
      const loginSpy = vi.spyOn(Client.prototype, "login").mockImplementation(() => {
        return Promise.reject(new Error("Persistent error"));
      });

      const result = await manager.startClient(userId, connectionId, token, serverId, channelId);
      expect(result.success).toBe(true);

      // Verify client exists initially
      expect(manager.getStatus(userId)).not.toBeNull();

      // Run through all 5 attempts
      await vi.advanceTimersByTimeAsync(100); // Attempt 1
      await vi.advanceTimersByTimeAsync(5000); // Attempt 2
      await vi.advanceTimersByTimeAsync(10000); // Attempt 3
      await vi.advanceTimersByTimeAsync(20000); // Attempt 4
      await vi.advanceTimersByTimeAsync(30000); // Attempt 5

      // After max attempts, client should be removed
      await vi.advanceTimersByTimeAsync(100);
      expect(manager.getStatus(userId)).toBeNull();

      // Active client count should be 0
      expect(manager.getActiveClientCount()).toBe(0);

      loginSpy.mockRestore();
    });
  });

  describe("4. Error Classification", () => {
    it("should not retry on Improper token error", async () => {
      const loginSpy = vi.spyOn(Client.prototype, "login").mockImplementation(() => {
        return Promise.reject(new Error("Improper token has been passed"));
      });

      const result = await manager.startClient(userId, connectionId, token, serverId, channelId);
      expect(result.success).toBe(true);

      await vi.advanceTimersByTimeAsync(100);

      // Client should be stopped
      expect(manager.getStatus(userId)).toBeNull();

      // Login should only be called once
      expect(loginSpy).toHaveBeenCalledTimes(1);

      loginSpy.mockRestore();
    });

    it("should not retry on Login timeout error", async () => {
      const loginSpy = vi.spyOn(Client.prototype, "login").mockImplementation(() => {
        return Promise.reject(new Error("Login timeout"));
      });

      const result = await manager.startClient(userId, connectionId, token, serverId, channelId);
      expect(result.success).toBe(true);

      await vi.advanceTimersByTimeAsync(100);

      // Client should be stopped
      expect(manager.getStatus(userId)).toBeNull();

      // Login should only be called once
      expect(loginSpy).toHaveBeenCalledTimes(1);

      loginSpy.mockRestore();
    });
  });
});

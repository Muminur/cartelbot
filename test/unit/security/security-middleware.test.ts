import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  rateLimit,
  clearRateLimits,
  getRateLimitHeaders,
  stopCleanup,
} from "@/lib/middleware/rate-limiter";
import {
  generateCsrfToken,
  verifyCsrfToken,
  getCsrfTokenFromRequest,
  stopCsrfCleanup,
} from "@/lib/security/csrf";
import {
  signRequest,
  verifyRequestSignature,
  stopNonceCleanup,
} from "@/lib/security/request-verifier";
import {
  sanitizeEmail,
  sanitizeSignalText,
  sanitizeSymbol,
  sanitizeNumeric,
} from "@/lib/security/sanitizer";
import { sanitizeMongoQuery, isValidObjectId } from "@/lib/security/nosql-guard";

describe("Security Middleware", () => {
  beforeEach(() => {
    clearRateLimits();
  });

  afterEach(() => {
    clearRateLimits();
    stopCleanup();
    stopCsrfCleanup();
    stopNonceCleanup();
  });

  describe("Rate Limiter", () => {
    it("should allow requests within limit", async () => {
      const result = await rateLimit("test-user", "api");
      expect(result).toBeNull();
    });

    it("should block requests exceeding limit", async () => {
      // Exhaust all tokens (api limit is 100)
      for (let i = 0; i < 100; i++) {
        await rateLimit("test-user-2", "api");
      }

      const result = await rateLimit("test-user-2", "api");
      expect(result).not.toBeNull();
      expect(result?.status).toBe(429);
    });

    it("should return correct rate limit headers", () => {
      const headers = getRateLimitHeaders("test-user-3", "api");
      expect(headers["X-RateLimit-Limit"]).toBe("100");
      expect(headers["X-RateLimit-Remaining"]).toBe("100");
    });

    it("should clear rate limits for specific user", async () => {
      await rateLimit("test-user-4", "api");
      clearRateLimits("test-user-4", "api");

      const headers = getRateLimitHeaders("test-user-4", "api");
      expect(headers["X-RateLimit-Remaining"]).toBe("100");
    });
  });

  describe("CSRF Protection", () => {
    it("should generate valid CSRF token", () => {
      const token = generateCsrfToken("session-1");
      expect(token).toBeDefined();
      expect(token.length).toBe(64); // 32 bytes = 64 hex chars
    });

    it("should verify valid CSRF token", () => {
      const token = generateCsrfToken("session-2");
      const isValid = verifyCsrfToken("session-2", token);
      expect(isValid).toBe(true);
    });

    it("should reject invalid CSRF token", () => {
      generateCsrfToken("session-3");
      const isValid = verifyCsrfToken("session-3", "invalid-token");
      expect(isValid).toBe(false);
    });

    it("should reject mismatched token lengths", () => {
      const token = generateCsrfToken("session-4");
      const shortToken = token.substring(0, 32);
      const isValid = verifyCsrfToken("session-4", shortToken);
      expect(isValid).toBe(false);
    });

    it("should extract CSRF token from request header", () => {
      const request = new Request("http://localhost", {
        headers: {
          "x-csrf-token": "test-token-123",
        },
      });

      const token = getCsrfTokenFromRequest(request);
      expect(token).toBe("test-token-123");
    });
  });

  describe("Request Signature Verification", () => {
    const secret = "test-secret-key-12345678901234567890";

    it("should sign request with timestamp and nonce", () => {
      const payload = JSON.stringify({ test: "data" });
      const { signature, timestamp, nonce } = signRequest(payload, secret);

      expect(signature).toBeDefined();
      expect(timestamp).toBeDefined();
      expect(nonce).toBeDefined();
      expect(signature.length).toBe(64); // HMAC SHA256 = 64 hex chars
    });

    it("should verify valid signature", async () => {
      const payload = JSON.stringify({ test: "data" });
      const { signature, timestamp, nonce } = signRequest(payload, secret);

      const request = new Request("http://localhost", {
        method: "POST",
        headers: {
          "x-signature": signature,
          "x-timestamp": timestamp,
          "x-nonce": nonce,
        },
        body: payload,
      });

      const result = await verifyRequestSignature(request, secret);
      expect(result).toBeNull();
    });

    it("should reject invalid signature", async () => {
      const payload = JSON.stringify({ test: "data" });
      const { timestamp, nonce } = signRequest(payload, secret);

      const request = new Request("http://localhost", {
        method: "POST",
        headers: {
          "x-signature": "invalid-signature-123456789012345678901234567890123456789012345678901234567890",
          "x-timestamp": timestamp,
          "x-nonce": nonce,
        },
        body: payload,
      });

      const result = await verifyRequestSignature(request, secret);
      expect(result).not.toBeNull();
      expect(result?.status).toBe(401);
    });

    it("should reject expired timestamp", async () => {
      const payload = JSON.stringify({ test: "data" });
      const { signature, nonce } = signRequest(payload, secret);
      const oldTimestamp = (Date.now() - 400000).toString(); // 6+ minutes ago

      const request = new Request("http://localhost", {
        method: "POST",
        headers: {
          "x-signature": signature,
          "x-timestamp": oldTimestamp,
          "x-nonce": nonce,
        },
        body: payload,
      });

      const result = await verifyRequestSignature(request, secret);
      expect(result).not.toBeNull();
      expect(result?.status).toBe(401);
    });
  });

  describe("Input Sanitization", () => {
    it("should sanitize email correctly", () => {
      const email = sanitizeEmail("  TEST@EXAMPLE.COM  ");
      expect(email).toBe("test@example.com");
    });

    it("should reject invalid email", () => {
      expect(() => sanitizeEmail("not-an-email")).toThrow("Invalid email format");
    });

    it("should sanitize signal text", () => {
      const text = sanitizeSignalText("<script>alert('xss')</script>Buy $BTC");
      expect(text).not.toContain("<script>");
      expect(text).toContain("Buy $BTC");
    });

    it("should remove javascript: protocol", () => {
      const text = sanitizeSignalText("javascript:alert('xss')");
      expect(text).not.toContain("javascript:");
    });

    it("should sanitize trading symbol", () => {
      const symbol = sanitizeSymbol("  btcusdt  ");
      expect(symbol).toBe("BTCUSDT");
    });

    it("should reject invalid symbol format", () => {
      expect(() => sanitizeSymbol("B")).toThrow("Invalid symbol format"); // Too short (min 2)
      expect(() => sanitizeSymbol("BTC-USDT")).toThrow("Invalid symbol format"); // Invalid char -
      expect(() => sanitizeSymbol("BTCUSDTBTCUSDTBTCUSDTX")).toThrow("Invalid symbol format"); // Too long (max 20)
    });

    it("should sanitize numeric input", () => {
      const num = sanitizeNumeric("123.45");
      expect(num).toBe(123.45);
    });

    it("should reject invalid numeric input", () => {
      expect(() => sanitizeNumeric("abc")).toThrow("Invalid numeric value");
      expect(() => sanitizeNumeric(NaN)).toThrow("Invalid numeric value");
      expect(() => sanitizeNumeric(Infinity)).toThrow("Invalid numeric value");
    });
  });

  describe("NoSQL Injection Prevention", () => {
    it("should sanitize MongoDB queries", () => {
      const query = { email: "test@example.com", $where: "malicious code" };
      const sanitized = sanitizeMongoQuery(query);

      expect(sanitized).toHaveProperty("email");
      expect(sanitized).not.toHaveProperty("$where");
    });

    it("should allow safe query operators", () => {
      const query = { age: { $gte: 18, $lte: 65 } };
      const sanitized = sanitizeMongoQuery(query);

      expect(sanitized).toEqual(query);
    });

    it("should remove dangerous operators", () => {
      const query = {
        email: "test@example.com",
        $where: "this.password == 'leaked'",
        $regex: "/.*admin.*/",
      };
      const sanitized = sanitizeMongoQuery(query) as Record<string, unknown>;

      expect(sanitized.$where).toBeUndefined();
      expect(sanitized.$regex).toBeUndefined();
      expect(sanitized.email).toBe("test@example.com");
    });

    it("should validate ObjectId format", () => {
      expect(isValidObjectId("507f1f77bcf86cd799439011")).toBe(true);
      expect(isValidObjectId("invalid-id")).toBe(false);
      expect(isValidObjectId("507f1f77bcf86cd79943901")).toBe(false); // Too short
    });
  });
});

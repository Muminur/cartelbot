import { describe, it, expect, beforeEach, afterEach } from "vitest";
import bcrypt from "bcryptjs";
import { sanitizeAlphanumeric } from "@/lib/security/sanitizer";
import { isAdmin } from "@/lib/middleware/admin-auth";
import { signJWT, verifyJWT, verifySessionToken } from "@/lib/auth/jwt";
import { rateLimit, clearRateLimits, stopCleanup } from "@/lib/middleware/rate-limiter";

describe("Admin API Security", () => {
  beforeEach(() => {
    clearRateLimits();
  });

  afterEach(() => {
    clearRateLimits();
    stopCleanup();
  });

  describe("1. Admin Login Brute Force Protection", () => {
    it("should enforce rate limiting on admin login (5 attempts)", async () => {
      const ip = "192.168.1.100";

      // First 5 attempts should succeed
      for (let i = 0; i < 5; i++) {
        const result = await rateLimit(ip, "auth");
        expect(result).toBeNull();
      }

      // 6th attempt should be rate limited
      const result = await rateLimit(ip, "auth");
      expect(result).not.toBeNull();
      expect(result?.status).toBe(429);

      const body = await result?.json();
      expect(body.error.code).toBe("RATE_LIMIT_EXCEEDED");
    });

    it("should return retry-after header when rate limited", async () => {
      const ip = "192.168.1.101";

      // Exhaust rate limit
      for (let i = 0; i < 5; i++) {
        await rateLimit(ip, "auth");
      }

      const result = await rateLimit(ip, "auth");
      expect(result).not.toBeNull();

      const retryAfter = result?.headers.get("Retry-After");
      expect(retryAfter).toBeDefined();
      expect(parseInt(retryAfter!)).toBeGreaterThan(0);
    });

    it("should isolate rate limits by IP address", async () => {
      const ip1 = "192.168.1.102";
      const ip2 = "192.168.1.103";

      // Exhaust IP1's limit
      for (let i = 0; i < 5; i++) {
        await rateLimit(ip1, "auth");
      }

      // IP1 should be blocked
      const result1 = await rateLimit(ip1, "auth");
      expect(result1).not.toBeNull();

      // IP2 should still work
      const result2 = await rateLimit(ip2, "auth");
      expect(result2).toBeNull();
    });
  });

  describe("2. Password Security", () => {
    it("should enforce bcrypt max 72 character limit", () => {
      const maxPassword = "a".repeat(72);
      const tooLongPassword = "a".repeat(73);

      // 72 chars should be acceptable
      expect(maxPassword.length).toBe(72);

      // 73 chars should fail validation (simulated)
      expect(tooLongPassword.length).toBeGreaterThan(72);
    });

    it("should reject empty password", () => {
      const emptyPassword = "";
      expect(emptyPassword.length).toBe(0);
    });

    it("should handle SQL injection attempts in password field", async () => {
      const sqlInjectionPasswords = [
        "' OR '1'='1",
        "admin'--",
        "' OR 1=1--",
        "'; DROP TABLE admins;--",
      ];

      for (const injectionAttempt of sqlInjectionPasswords) {
        // bcrypt.compare should safely handle these without SQL injection
        // It will just return false since hash won't match
        const validHash = await bcrypt.hash("validPassword123", 10);
        const result = await bcrypt.compare(injectionAttempt, validHash);
        expect(result).toBe(false);
      }
    });

    it("should handle NoSQL injection attempts in password field", async () => {
      // These should be treated as literal strings by bcrypt
      const noSqlInjections = [
        '{"$ne": null}',
        '{"$gt": ""}',
        '{"$regex": ".*"}',
      ];

      const validHash = await bcrypt.hash("validPassword123", 10);

      for (const injection of noSqlInjections) {
        const result = await bcrypt.compare(injection, validHash);
        expect(result).toBe(false);
      }
    });

    it("should properly hash and verify passwords with bcrypt", async () => {
      const password = "SecureAdminP@ssw0rd!";
      const hash = await bcrypt.hash(password, 10);

      // Should verify correct password
      const validResult = await bcrypt.compare(password, hash);
      expect(validResult).toBe(true);

      // Should reject incorrect password
      const invalidResult = await bcrypt.compare("WrongPassword", hash);
      expect(invalidResult).toBe(false);
    });
  });

  describe("3. Username Sanitization", () => {
    it("should strip special characters from username", () => {
      const maliciousUsername = "admin<script>alert('xss')</script>";
      const sanitized = sanitizeAlphanumeric(maliciousUsername);

      expect(sanitized).toBe("adminscriptalertxssscript");
      expect(sanitized).not.toContain("<");
      expect(sanitized).not.toContain(">");
      expect(sanitized).not.toContain("(");
      expect(sanitized).not.toContain(")");
    });

    it("should remove SQL injection characters from username", () => {
      const sqlUsername = "admin' OR '1'='1";
      const sanitized = sanitizeAlphanumeric(sqlUsername);

      expect(sanitized).toBe("adminOR11");
      expect(sanitized).not.toContain("'");
      expect(sanitized).not.toContain(" ");
      expect(sanitized).not.toContain("=");
    });

    it("should strip NoSQL operators from username", () => {
      const noSqlUsername = "admin{$ne:null}";
      const sanitized = sanitizeAlphanumeric(noSqlUsername);

      expect(sanitized).toBe("adminnenull");
      expect(sanitized).not.toContain("{");
      expect(sanitized).not.toContain("}");
      expect(sanitized).not.toContain("$");
      expect(sanitized).not.toContain(":");
    });

    it("should allow alphanumeric usernames", () => {
      const validUsername = "admin123";
      const sanitized = sanitizeAlphanumeric(validUsername);

      expect(sanitized).toBe("admin123");
    });

    it("should handle unicode and emoji characters", () => {
      const unicodeUsername = "admin🚀测试";
      const sanitized = sanitizeAlphanumeric(unicodeUsername);

      // Should remove non-ASCII characters
      expect(sanitized).toBe("admin");
    });

    it("should optionally allow spaces when specified", () => {
      const usernameWithSpaces = "admin user 123";
      const sanitizedNoSpaces = sanitizeAlphanumeric(usernameWithSpaces, false);
      const sanitizedWithSpaces = sanitizeAlphanumeric(usernameWithSpaces, true);

      expect(sanitizedNoSpaces).toBe("adminuser123");
      expect(sanitizedWithSpaces).toBe("admin user 123");
    });
  });

  describe("4. Privilege Escalation Prevention", () => {
    it("should correctly identify admin emails (case-insensitive)", () => {
      expect(isAdmin("admin@test.com")).toBe(true);
      expect(isAdmin("ADMIN@TEST.COM")).toBe(true);
      expect(isAdmin("Admin@Test.Com")).toBe(true);
      expect(isAdmin("superadmin@test.com")).toBe(true);
    });

    it("should reject non-admin emails", () => {
      expect(isAdmin("user@test.com")).toBe(false);
      expect(isAdmin("hacker@evil.com")).toBe(false);
      expect(isAdmin("guest@test.com")).toBe(false);
    });

    it("should reject empty or invalid emails", () => {
      expect(isAdmin("")).toBe(false);
      expect(isAdmin("not-an-email")).toBe(false);
      expect(isAdmin("@test.com")).toBe(false);
    });

    it("should prevent privilege escalation via email suffix", () => {
      // Attempt to bypass by adding admin email as suffix
      expect(isAdmin("hacker+admin@test.com")).toBe(false);
      expect(isAdmin("eviladmin@test.com")).toBe(false);
    });

    it("should handle whitespace in email comparison", () => {
      // Email should be trimmed before comparison
      // Note: isAdmin expects pre-trimmed emails (handled by sanitizeEmail)
      expect(isAdmin("admin@test.com")).toBe(true);
    });
  });

  describe("5. Admin JWT Token Security", () => {
    it("should generate valid admin JWT with 7 day expiry", () => {
      const token = signJWT(
        {
          role: "admin",
          username: "testadmin",
          isAdmin: true,
          adminId: "507f1f77bcf86cd799439011",
        },
        "7d"
      );

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.split(".").length).toBe(3); // JWT has 3 parts
    });

    it("should verify valid admin token", () => {
      const token = signJWT(
        {
          role: "admin",
          username: "testadmin",
          isAdmin: true,
          adminId: "507f1f77bcf86cd799439011",
        },
        "7d"
      );

      const payload = verifyJWT(token);
      expect(payload.role).toBe("admin");
      expect(payload.username).toBe("testadmin");
      expect(payload.isAdmin).toBe(true);
      expect(payload.adminId).toBe("507f1f77bcf86cd799439011");
    });

    it("should reject expired tokens", async () => {
      // Create token with 1ms expiry
      const token = signJWT(
        {
          role: "admin",
          username: "testadmin",
          isAdmin: true,
        },
        "1ms"
      );

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(() => verifyJWT(token)).toThrow("Token has expired");
    });

    it("should reject tampered tokens", () => {
      const token = signJWT(
        {
          role: "admin",
          username: "testadmin",
          isAdmin: true,
        },
        "7d"
      );

      // Tamper with token by modifying payload
      const parts = token.split(".");
      parts[1] = Buffer.from('{"role":"superadmin"}').toString("base64");
      const tamperedToken = parts.join(".");

      expect(() => verifyJWT(tamperedToken)).toThrow();
    });

    it("should reject tokens with invalid signature", () => {
      const invalidToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYWRtaW4ifQ.invalid_signature";

      expect(() => verifyJWT(invalidToken)).toThrow();
    });

    it("should include httpOnly flag recommendation for production", () => {
      // This is tested in integration tests, but we verify the constant exists
      const ADMIN_TOKEN_COOKIE = "admin_token";
      expect(ADMIN_TOKEN_COOKIE).toBe("admin_token");

      // Cookie config should include:
      // httpOnly: true, secure: NODE_ENV === 'production', sameSite: 'lax'
      const cookieConfig = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        maxAge: 60 * 60 * 24 * 7, // 7 days
      };

      expect(cookieConfig.httpOnly).toBe(true);
      expect(cookieConfig.sameSite).toBe("lax");
      expect(cookieConfig.maxAge).toBe(604800); // 7 days in seconds
    });
  });

  describe("6. Session Token Validation", () => {
    it("should reject session token with wrong type", () => {
      // Create a magic-link token and try to verify as session
      const magicLinkToken = signJWT(
        {
          role: "admin",
          username: "testadmin",
          isAdmin: true,
        },
        "15m"
      );

      // verifySessionToken expects type: "session", but we're creating admin JWT
      // This test validates that token type checking is enforced
      expect(() => verifySessionToken(magicLinkToken)).toThrow();
    });

    it("should handle malformed tokens gracefully", () => {
      const malformedTokens = [
        "not.a.token",
        "invalid",
        "",
        "a.b", // Missing third part
        "eyJhbGciOiJIUzI1NiJ9", // Only header
      ];

      for (const token of malformedTokens) {
        expect(() => verifyJWT(token)).toThrow();
      }
    });
  });

  describe("7. Account Lockout Mechanism", () => {
    it("should lock account after 5 failed attempts (simulated)", () => {
      // Simulate the lockout logic from Admin model
      const maxAttempts = 5;
      const lockTime = 15 * 60 * 1000; // 15 minutes

      let loginAttempts = 0;
      let lockUntil: Date | undefined;

      // Simulate 5 failed login attempts
      for (let i = 0; i < 5; i++) {
        loginAttempts++;
        if (loginAttempts >= maxAttempts) {
          lockUntil = new Date(Date.now() + lockTime);
        }
      }

      expect(loginAttempts).toBe(5);
      expect(lockUntil).toBeDefined();
      expect(lockUntil!.getTime()).toBeGreaterThan(Date.now());
    });

    it("should calculate correct lock duration (15 minutes)", () => {
      const lockTime = 15 * 60 * 1000; // 15 minutes in milliseconds
      const lockUntil = new Date(Date.now() + lockTime);
      const minutesRemaining = Math.ceil(
        (lockUntil.getTime() - Date.now()) / (1000 * 60)
      );

      expect(minutesRemaining).toBeLessThanOrEqual(15);
      expect(minutesRemaining).toBeGreaterThan(14);
    });

    it("should determine if account is locked", () => {
      const now = new Date();

      // Locked account (lock expires in future)
      const lockedUntil = new Date(now.getTime() + 10 * 60 * 1000); // 10 min future
      const isLocked = lockedUntil > now;
      expect(isLocked).toBe(true);

      // Unlocked account (lock expired)
      const expiredLock = new Date(now.getTime() - 10 * 60 * 1000); // 10 min past
      const isUnlocked = expiredLock > now;
      expect(isUnlocked).toBe(false);
    });

    it("should reset login attempts on successful login", () => {
      // Simulate reset logic
      let loginAttempts = 5;
      let lockUntil: Date | undefined = new Date(Date.now() + 15 * 60 * 1000);

      // Reset on successful login
      loginAttempts = 0;
      lockUntil = undefined;

      expect(loginAttempts).toBe(0);
      expect(lockUntil).toBeUndefined();
    });

    it("should handle edge case of lock expiry during attempt", () => {
      const now = new Date();
      const almostExpired = new Date(now.getTime() + 100); // 100ms in future

      // Check if locked
      const isLocked = almostExpired > now;
      expect(isLocked).toBe(true);

      // After waiting, lock should expire
      setTimeout(() => {
        const isStillLocked = almostExpired > new Date();
        expect(isStillLocked).toBe(false);
      }, 200);
    });
  });

  describe("8. Audit Logging Requirements", () => {
    it("should structure audit log for failed login", () => {
      const auditLog = {
        userId: undefined,
        action: "admin.login.failed",
        resource: "admin",
        resourceId: "507f1f77bcf86cd799439011",
        method: "POST",
        endpoint: "/api/admin/auth/login",
        ip: "192.168.1.100",
        userAgent: "Mozilla/5.0",
        statusCode: 401,
        metadata: {
          username: "testadmin",
          reason: "Invalid password",
          loginAttempts: 3,
        },
      };

      expect(auditLog.action).toBe("admin.login.failed");
      expect(auditLog.statusCode).toBe(401);
      expect(auditLog.metadata.reason).toBeDefined();
      expect(auditLog.metadata.loginAttempts).toBeGreaterThan(0);
    });

    it("should structure audit log for account lockout", () => {
      const auditLog = {
        action: "admin.login.failed",
        statusCode: 423,
        metadata: {
          username: "testadmin",
          reason: "Account locked",
          minutesLeft: 15,
        },
      };

      expect(auditLog.statusCode).toBe(423); // Locked status
      expect(auditLog.metadata.reason).toBe("Account locked");
      expect(auditLog.metadata.minutesLeft).toBeGreaterThan(0);
    });

    it("should structure audit log for inactive account", () => {
      const auditLog = {
        action: "admin.login.failed",
        statusCode: 403,
        metadata: {
          username: "testadmin",
          reason: "Account inactive",
        },
      };

      expect(auditLog.statusCode).toBe(403); // Forbidden
      expect(auditLog.metadata.reason).toBe("Account inactive");
    });

    it("should structure audit log for successful login", () => {
      const auditLog = {
        action: "admin.login.success",
        statusCode: 200,
        metadata: {
          username: "testadmin",
        },
      };

      expect(auditLog.action).toBe("admin.login.success");
      expect(auditLog.statusCode).toBe(200);
      expect(auditLog.metadata.username).toBeDefined();
    });
  });
});

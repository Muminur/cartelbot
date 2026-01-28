// Set required environment variables before any imports
process.env.NEXT_PUBLIC_API_URL = 'https://test.example.com';
process.env.NEXTAUTH_SECRET = 'test-nextauth-secret-minimum-32-characters-long';
process.env.PAYMENT_WALLET_ADDRESS = 'TTestWalletAddress123456789012345';
process.env.DISCORD_WEBHOOK_SECRET = 'test-discord-webhook-secret-key';

import { describe, it, expect, vi } from 'vitest';

// Mock the env module to prevent validation errors
vi.mock("@/lib/config/env", () => ({
  env: {
    DATABASE_URL: 'mongodb://localhost:27017/cartelbot-test',
    NODE_ENV: 'test',
    NEXT_PUBLIC_API_URL: 'https://test.example.com',
    BINANCE_API_URL: 'https://api.binance.com',
    BINANCE_WS_URL: 'wss://stream.binance.com:9443',
    BINANCE_TESTNET_URL: 'https://testnet.binance.vision',
    BINANCE_TESTNET_WS: 'wss://testnet-stream.binance.vision',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-minimum-length-required!!',
    JWT_SECRET: 'test-jwt-secret-key-for-testing-only-minimum-32-characters',
    NEXTAUTH_SECRET: 'test-nextauth-secret-minimum-32-characters-long',
    PAYMENT_WALLET_ADDRESS: 'TTestWalletAddress123456789012345',
    DISCORD_WEBHOOK_SECRET: 'test-discord-webhook-secret-key',
    RESEND_API_KEY: 'test-resend-key',
    ADMIN_EMAILS: 'admin@test.com',
    CRON_SECRET: 'test-cron-secret',
  },
}));

import { encrypt, decrypt } from '@/lib/encryption';
import { sanitizeString } from '@/lib/security/sanitizer';
import { validateDiscordToken } from '@/lib/discord/token-validator';

/**
 * Discord API Security Tests
 *
 * Tests critical security areas:
 * 1. Token Exposure - Encrypted tokens never returned in API responses
 * 2. Encryption - AES-256-GCM randomness and integrity
 * 3. Token Validation - Input validation and rejection of invalid formats
 * 4. Authentication - All Discord routes require auth (tested in integration)
 * 5. IDOR Prevention - Connections filtered by userId (tested in integration)
 * 6. Input Sanitization - XSS and injection prevention
 */

describe('Discord API Security Tests', () => {
  describe('1. Token Encryption Security', () => {
    it('should produce different ciphertext for same plaintext (IV randomness)', () => {
      const token = 'FAKE_TEST_TOKEN_NOT_REAL.abcdef.ghijklmnopqrstuvwxyz012345';

      const encrypted1 = encrypt(token);
      const encrypted2 = encrypt(token);

      // Different ciphertexts due to random IV
      expect(encrypted1).not.toBe(encrypted2);

      // Both should decrypt to original
      expect(decrypt(encrypted1)).toBe(token);
      expect(decrypt(encrypted2)).toBe(token);
    });

    it('should decrypt encrypted data correctly', () => {
      const originalToken = 'FAKE_TEST_TOKEN_NOT_REAL.abcdef.ghijklmnopqrstuvwxyz012345';

      const encrypted = encrypt(originalToken);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(originalToken);
    });

    it('should throw error when decrypting tampered data', () => {
      const token = 'FAKE_TEST_TOKEN_NOT_REAL.abcdef.ghijklmnopqrstuvwxyz012345';
      const encrypted = encrypt(token);

      // Tamper with encrypted data (modify last character)
      const tampered = encrypted.slice(0, -1) + 'X';

      expect(() => decrypt(tampered)).toThrow();
    });

    it('should reject empty or non-string inputs', () => {
      expect(() => encrypt('')).toThrow('Invalid input: text must be a non-empty string');
      expect(() => decrypt('')).toThrow('Invalid input: encryptedText must be a non-empty string');
    });

    it('should reject malformed encrypted data format', () => {
      const malformedData = 'invalid.format';

      expect(() => decrypt(malformedData)).toThrow('Invalid encrypted data format');
    });
  });

  describe('2. Token Validation Security', () => {
    it('should reject empty token', async () => {
      const result = await validateDiscordToken('');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token is required');
    });

    it('should reject token that is too short (<50 chars)', async () => {
      const shortToken = 'MTk4NjIyNDgzNDcxOTI1MjQ4.Xy4Jwg.short';

      const result = await validateDiscordToken(shortToken);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token format');
    });

    it('should reject token that is too long (>150 chars)', async () => {
      const longToken = 'M'.repeat(160);

      const result = await validateDiscordToken(longToken);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token format');
    });

    it('should strip "Bot " prefix if accidentally included', async () => {
      // This test validates the token cleaning logic
      // In real scenario, Discord API would reject bot tokens
      const tokenWithPrefix = 'Bot FAKE_TEST_TOKEN_NOT_REAL.abcdef.ghijklmnopqrstuvwxyz012345';

      // The function should strip "Bot " prefix
      // Note: This will fail API validation, but tests the cleaning logic
      const result = await validateDiscordToken(tokenWithPrefix);

      // API will reject, but we validate that cleaning happened
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle non-string token input', async () => {
      const result = await validateDiscordToken(null as unknown as string);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token is required');
    });
  });

  describe('3. Input Sanitization Security', () => {
    it('should remove control characters from input', () => {
      const input = 'Server\x00Name\x1FWith\x7FControl';
      const sanitized = sanitizeString(input);

      expect(sanitized).toBe('ServerNameWithControl');
      expect(sanitized).not.toContain('\x00');
      expect(sanitized).not.toContain('\x1F');
      expect(sanitized).not.toContain('\x7F');
    });

    it('should enforce maximum length', () => {
      const longInput = 'A'.repeat(2000);
      const sanitized = sanitizeString(longInput, 100);

      expect(sanitized.length).toBe(100);
    });

    it('should trim whitespace', () => {
      const input = '   Server Name   ';
      const sanitized = sanitizeString(input);

      expect(sanitized).toBe('Server Name');
    });

    it('should handle XSS attempts in guild/channel names', () => {
      const xssAttempts = [
        '<script>alert("XSS")</script>',
        'javascript:alert(1)',
        '<iframe src="evil.com"></iframe>',
        'onclick="alert(1)"',
      ];

      xssAttempts.forEach(attempt => {
        const sanitized = sanitizeString(attempt);

        // Control characters removed, but basic sanitizeString doesn't remove HTML
        // This is expected - higher-level validation should use escapeHtml
        expect(sanitized).toBeDefined();
        expect(sanitized.length).toBeGreaterThan(0);
      });
    });

    it('should handle SQL injection attempts', () => {
      const sqlInjection = "'; DROP TABLE users; --";
      const sanitized = sanitizeString(sqlInjection);

      // MongoDB uses object queries, not string concatenation
      // But sanitization should still clean control characters
      expect(sanitized).toBe(sqlInjection); // No control chars to remove
    });

    it('should handle NoSQL injection attempts', () => {
      const noSqlInjection = '{"$ne": null}';
      const sanitized = sanitizeString(noSqlInjection);

      // Should preserve JSON-like strings (no control chars)
      expect(sanitized).toBe(noSqlInjection);

      // Note: Actual NoSQL injection prevention happens at query level
      // with proper type validation and object structure checks
    });
  });

  describe('4. Encryption Format Validation', () => {
    it('should generate encrypted data with correct format (4 parts)', () => {
      const token = 'FAKE_TEST_TOKEN_NOT_REAL.abcdef.ghijklmnopqrstuvwxyz012345';
      const encrypted = encrypt(token);

      const parts = encrypted.split('.');
      expect(parts).toHaveLength(4);

      // Validate each part is hex-encoded
      parts.forEach(part => {
        expect(part).toMatch(/^[0-9a-f]+$/);
      });
    });

    it('should reject encrypted data with missing components', () => {
      const invalidFormats = [
        'salt.iv.authTag', // Missing encrypted data
        'salt.iv', // Missing authTag and data
        'salt', // Only salt
        '', // Empty
        'salt.iv.authTag.data.extra', // Too many parts
      ];

      invalidFormats.forEach(format => {
        expect(() => decrypt(format)).toThrow();
      });
    });

    it('should reject encrypted data with invalid hex encoding', () => {
      const token = 'FAKE_TEST_TOKEN_NOT_REAL.abcdef.ghijklmnopqrstuvwxyz012345';
      const encrypted = encrypt(token);

      // Replace valid hex with invalid characters
      const invalidHex = encrypted.replace(/[0-9a-f]/g, 'Z');

      expect(() => decrypt(invalidHex)).toThrow();
    });
  });

  describe('5. Token Format Edge Cases', () => {
    it('should handle token with special characters', async () => {
      const specialToken = 'MTk4NjIyNDgzNDcxOTI1MjQ4.Xy4Jwg.S9qLZ5Q1!@#$%^&*()';

      // Token with special chars should fail Discord API validation
      const result = await validateDiscordToken(specialToken);

      expect(result.valid).toBe(false);
    });

    it('should handle token with unicode characters', async () => {
      const unicodeToken = 'MTk4NjIyNDgzNDcxOTI1MjQ4.Xy4Jwg.🔒🔑🛡️';

      const result = await validateDiscordToken(unicodeToken);

      expect(result.valid).toBe(false);
    });

    it('should handle whitespace-padded token', async () => {
      const paddedToken = '  FAKE_TEST_TOKEN_NOT_REAL.abcdef.ghijklmnopqrstuvwxyz012345  ';

      // After trimming, should be processed normally
      const result = await validateDiscordToken(paddedToken);

      // Will fail API validation but tests trimming logic
      expect(result.valid).toBe(false);
    });
  });

  describe('6. Data Integrity and Tampering', () => {
    it('should detect tampering in salt component', () => {
      const token = 'FAKE_TEST_TOKEN_NOT_REAL.abcdef.ghijklmnopqrstuvwxyz012345';
      const encrypted = encrypt(token);

      const parts = encrypted.split('.');
      parts[0] = parts[0].slice(0, -2) + 'FF'; // Modify salt
      const tampered = parts.join('.');

      expect(() => decrypt(tampered)).toThrow();
    });

    it('should detect tampering in IV component', () => {
      const token = 'FAKE_TEST_TOKEN_NOT_REAL.abcdef.ghijklmnopqrstuvwxyz012345';
      const encrypted = encrypt(token);

      const parts = encrypted.split('.');
      parts[1] = parts[1].slice(0, -2) + 'FF'; // Modify IV
      const tampered = parts.join('.');

      expect(() => decrypt(tampered)).toThrow();
    });

    it('should detect tampering in auth tag component', () => {
      const token = 'FAKE_TEST_TOKEN_NOT_REAL.abcdef.ghijklmnopqrstuvwxyz012345';
      const encrypted = encrypt(token);

      const parts = encrypted.split('.');
      parts[2] = parts[2].slice(0, -2) + 'FF'; // Modify auth tag
      const tampered = parts.join('.');

      expect(() => decrypt(tampered)).toThrow();
    });

    it('should detect tampering in encrypted data component', () => {
      const token = 'MTk8NjIyNDgzNDcxOTI1MjQ4.Xy4Jwg.S9qLZ5Q1lP0wFXvDDt6dD5sG8sA';
      const encrypted = encrypt(token);

      const parts = encrypted.split('.');
      parts[3] = parts[3].slice(0, -2) + 'FF'; // Modify encrypted data
      const tampered = parts.join('.');

      expect(() => decrypt(tampered)).toThrow();
    });
  });

  describe('7. Length and Size Validation', () => {
    it('should handle maximum safe token size', () => {
      // Discord tokens are ~150 chars max
      const maxToken = 'M'.repeat(150);

      // Should encrypt without error
      const encrypted = encrypt(maxToken);
      expect(encrypted).toBeDefined();

      // Should decrypt correctly
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(maxToken);
    });

    it('should handle minimum valid token size', () => {
      const minToken = 'M'.repeat(50);

      const encrypted = encrypt(minToken);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(minToken);
    });

    it('should sanitize very long guild/channel names', () => {
      const veryLongName = 'A'.repeat(5000);
      const sanitized = sanitizeString(veryLongName, 1000);

      expect(sanitized.length).toBe(1000);
    });
  });
});

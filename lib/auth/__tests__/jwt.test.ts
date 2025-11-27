import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  generateMagicLinkToken,
  generateSessionToken,
  verifyMagicLinkToken,
  verifySessionToken,
  JWTPayload,
  SessionPayload
} from '../jwt';

describe('JWT Authentication', () => {
  const testEmail = 'test@example.com';
  const testUserId = '507f1f77bcf86cd799439011';

  describe('generateMagicLinkToken', () => {
    it('should generate a valid magic link token', () => {
      const token = generateMagicLinkToken(testEmail);

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT format: header.payload.signature
    });

    it('should encode email in token', () => {
      const token = generateMagicLinkToken(testEmail);
      const decoded = jwt.decode(token) as JWTPayload;

      expect(decoded.email).toBe(testEmail);
      expect(decoded.type).toBe('magic-link');
    });

    it('should set expiration time (15 minutes)', () => {
      const token = generateMagicLinkToken(testEmail);
      const decoded = jwt.decode(token) as JWTPayload;

      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();

      // Check expiry is approximately 15 minutes from now
      const expiresIn = (decoded.exp! - decoded.iat!) * 1000;
      expect(expiresIn).toBeGreaterThanOrEqual(14 * 60 * 1000); // At least 14 minutes
      expect(expiresIn).toBeLessThanOrEqual(16 * 60 * 1000);    // At most 16 minutes
    });

    it('should generate different tokens for same email', async () => {
      const token1 = generateMagicLinkToken(testEmail);

      // Wait 1100ms to ensure different iat timestamp (JWT uses seconds, not ms)
      await new Promise(resolve => setTimeout(resolve, 1100));

      const token2 = generateMagicLinkToken(testEmail);

      // Tokens should differ due to different iat (issued at) timestamps
      expect(token1).not.toBe(token2);
    });
  });

  describe('generateSessionToken', () => {
    it('should generate a valid session token', () => {
      const token = generateSessionToken(testUserId, testEmail);

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should encode userId and email in token', () => {
      const token = generateSessionToken(testUserId, testEmail);
      const decoded = jwt.decode(token) as SessionPayload;

      expect(decoded.userId).toBe(testUserId);
      expect(decoded.email).toBe(testEmail);
      expect(decoded.type).toBe('session');
    });

    it('should set expiration time (7 days)', () => {
      const token = generateSessionToken(testUserId, testEmail);
      const decoded = jwt.decode(token) as SessionPayload & { exp?: number; iat?: number };

      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();

      // Check expiry is approximately 7 days from now
      const expiresIn = (decoded.exp! - decoded.iat!) * 1000;
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      expect(expiresIn).toBeGreaterThanOrEqual(sevenDays - 1000);
      expect(expiresIn).toBeLessThanOrEqual(sevenDays + 1000);
    });
  });

  describe('verifyMagicLinkToken', () => {
    it('should verify a valid magic link token', () => {
      const token = generateMagicLinkToken(testEmail);
      const payload = verifyMagicLinkToken(token);

      expect(payload.email).toBe(testEmail);
      expect(payload.type).toBe('magic-link');
    });

    it('should throw error for invalid token', () => {
      const invalidToken = 'invalid.token.here';

      expect(() => verifyMagicLinkToken(invalidToken)).toThrow('Invalid magic link');
    });

    it('should throw error for wrong token type', () => {
      const sessionToken = generateSessionToken(testUserId, testEmail);

      expect(() => verifyMagicLinkToken(sessionToken)).toThrow('Invalid token type');
    });

    it('should throw error for expired token', () => {
      // Create a token that expired in the past
      const expiredToken = jwt.sign(
        { email: testEmail, type: 'magic-link' },
        process.env.JWT_SECRET!,
        { expiresIn: '-1s' }
      );

      expect(() => verifyMagicLinkToken(expiredToken)).toThrow('Magic link has expired');
    });

    it('should throw error for tampered token', () => {
      const token = generateMagicLinkToken(testEmail);
      const parts = token.split('.');

      // Tamper with payload
      parts[1] = Buffer.from('{"email":"hacker@evil.com","type":"magic-link"}').toString('base64');
      const tamperedToken = parts.join('.');

      expect(() => verifyMagicLinkToken(tamperedToken)).toThrow('Invalid magic link');
    });
  });

  describe('verifySessionToken', () => {
    it('should verify a valid session token', () => {
      const token = generateSessionToken(testUserId, testEmail);
      const payload = verifySessionToken(token);

      expect(payload.userId).toBe(testUserId);
      expect(payload.email).toBe(testEmail);
      expect(payload.type).toBe('session');
    });

    it('should throw error for invalid token', () => {
      const invalidToken = 'invalid.token.here';

      expect(() => verifySessionToken(invalidToken)).toThrow('Invalid session');
    });

    it('should throw error for wrong token type', () => {
      const magicLinkToken = generateMagicLinkToken(testEmail);

      expect(() => verifySessionToken(magicLinkToken)).toThrow('Invalid token type');
    });

    it('should throw error for expired token', () => {
      // Create a token that expired in the past
      const expiredToken = jwt.sign(
        { userId: testUserId, email: testEmail, type: 'session' },
        process.env.JWT_SECRET!,
        { expiresIn: '-1s' }
      );

      expect(() => verifySessionToken(expiredToken)).toThrow('Session has expired');
    });

    it('should throw error for tampered token', () => {
      const token = generateSessionToken(testUserId, testEmail);
      const parts = token.split('.');

      // Tamper with payload
      parts[1] = Buffer.from(JSON.stringify({
        userId: 'different-user-id',
        email: 'hacker@evil.com',
        type: 'session'
      })).toString('base64');
      const tamperedToken = parts.join('.');

      expect(() => verifySessionToken(tamperedToken)).toThrow('Invalid session');
    });
  });

  describe('Token lifecycle', () => {
    it('should handle complete magic link flow', () => {
      // Generate token
      const token = generateMagicLinkToken(testEmail);

      // Verify immediately (should work)
      const payload1 = verifyMagicLinkToken(token);
      expect(payload1.email).toBe(testEmail);

      // Can verify multiple times before expiry
      const payload2 = verifyMagicLinkToken(token);
      expect(payload2.email).toBe(testEmail);
    });

    it('should handle complete session flow', () => {
      // Generate token
      const token = generateSessionToken(testUserId, testEmail);

      // Verify immediately (should work)
      const payload1 = verifySessionToken(token);
      expect(payload1.userId).toBe(testUserId);
      expect(payload1.email).toBe(testEmail);

      // Can verify multiple times before expiry
      const payload2 = verifySessionToken(token);
      expect(payload2.userId).toBe(testUserId);
    });
  });
});

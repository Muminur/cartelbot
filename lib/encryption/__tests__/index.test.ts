import { describe, it, expect, beforeEach } from 'vitest';
import { encrypt, decrypt, hash, generateToken, createSignature, verifySignature } from '../index';

describe('Encryption Module', () => {
  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt a string correctly', () => {
      const plaintext = 'test-api-key-123';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
      expect(encrypted).not.toBe(plaintext);
    });

    it('should produce different ciphertexts for the same plaintext', () => {
      const plaintext = 'test-api-key-123';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);
      expect(decrypt(encrypted1)).toBe(plaintext);
      expect(decrypt(encrypted2)).toBe(plaintext);
    });

    it('should handle long strings', () => {
      const plaintext = 'a'.repeat(1000);
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle special characters', () => {
      const plaintext = '!@#$%^&*()_+-=[]{}|;:",.<>?/~`';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle unicode characters', () => {
      const plaintext = '你好世界🚀💰📈';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should produce encrypted text in correct format (salt.iv.authTag.data)', () => {
      const plaintext = 'test';
      const encrypted = encrypt(plaintext);
      const parts = encrypted.split('.');

      expect(parts).toHaveLength(4);
      expect(parts[0]).toHaveLength(128); // 64 bytes salt * 2 (hex)
      expect(parts[1]).toHaveLength(32);  // 16 bytes IV * 2 (hex)
      expect(parts[2]).toHaveLength(32);  // 16 bytes auth tag * 2 (hex)
      expect(parts[3].length).toBeGreaterThan(0);
    });

    it('should throw error when encrypting empty string', () => {
      expect(() => encrypt('')).toThrow('Invalid input');
    });

    it('should throw error when encrypting non-string', () => {
      expect(() => encrypt(123 as unknown as string)).toThrow('Invalid input');
      expect(() => encrypt(null as unknown as string)).toThrow('Invalid input');
      expect(() => encrypt(undefined as unknown as string)).toThrow('Invalid input');
    });

    it('should throw error when decrypting empty string', () => {
      expect(() => decrypt('')).toThrow('Invalid input');
    });

    it('should throw error when decrypting invalid format', () => {
      expect(() => decrypt('invalid-format')).toThrow('Invalid encrypted data format');
      expect(() => decrypt('one.two.three')).toThrow('Invalid encrypted data format');
    });

    it('should throw error when decrypting tampered data', () => {
      const plaintext = 'test';
      const encrypted = encrypt(plaintext);
      const parts = encrypted.split('.');

      // Tamper with encrypted data
      parts[3] = parts[3].slice(0, -2) + 'ff';
      const tampered = parts.join('.');

      expect(() => decrypt(tampered)).toThrow('Failed to decrypt');
    });

    it('should throw error when auth tag is invalid', () => {
      const plaintext = 'test';
      const encrypted = encrypt(plaintext);
      const parts = encrypted.split('.');

      // Tamper with auth tag
      parts[2] = parts[2].slice(0, -2) + 'ff';
      const tampered = parts.join('.');

      expect(() => decrypt(tampered)).toThrow('Failed to decrypt');
    });
  });

  describe('hash', () => {
    it('should hash a string consistently', () => {
      const text = 'test-password-123';
      const hash1 = hash(text);
      const hash2 = hash(text);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 produces 32 bytes = 64 hex chars
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = hash('password1');
      const hash2 = hash('password2');

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const result = hash('');
      expect(result).toHaveLength(64);
    });
  });

  describe('generateToken', () => {
    it('should generate a token of default length', () => {
      const token = generateToken();

      expect(token).toHaveLength(64); // 32 bytes * 2 (hex)
      expect(token).toMatch(/^[0-9a-f]+$/);
    });

    it('should generate a token of specified length', () => {
      const token = generateToken(16);

      expect(token).toHaveLength(32); // 16 bytes * 2 (hex)
    });

    it('should generate different tokens each time', () => {
      const token1 = generateToken();
      const token2 = generateToken();

      expect(token1).not.toBe(token2);
    });
  });

  describe('createSignature/verifySignature', () => {
    it('should create and verify a valid signature', () => {
      const data = 'test-data';
      const secret = 'test-secret';

      const signature = createSignature(data, secret);
      const isValid = verifySignature(data, signature, secret);

      expect(isValid).toBe(true);
      expect(signature).toHaveLength(64); // HMAC SHA256 = 32 bytes = 64 hex chars
    });

    it('should reject invalid signature', () => {
      const data = 'test-data';
      const secret = 'test-secret';
      const signature = createSignature(data, secret);

      // Tamper with signature
      const tamperedSignature = signature.slice(0, -2) + 'ff';
      const isValid = verifySignature(data, tamperedSignature, secret);

      expect(isValid).toBe(false);
    });

    it('should reject signature with different data', () => {
      const data = 'test-data';
      const secret = 'test-secret';
      const signature = createSignature(data, secret);

      const isValid = verifySignature('different-data', signature, secret);

      expect(isValid).toBe(false);
    });

    it('should reject signature with different secret', () => {
      const data = 'test-data';
      const secret = 'test-secret';
      const signature = createSignature(data, secret);

      const isValid = verifySignature(data, signature, 'different-secret');

      expect(isValid).toBe(false);
    });

    it('should create consistent signatures', () => {
      const data = 'test-data';
      const secret = 'test-secret';

      const signature1 = createSignature(data, secret);
      const signature2 = createSignature(data, secret);

      expect(signature1).toBe(signature2);
    });
  });
});

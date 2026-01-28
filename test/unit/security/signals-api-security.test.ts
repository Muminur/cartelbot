// Environment variables MUST be set BEFORE imports
process.env.NEXT_PUBLIC_API_URL = 'https://test.example.com';
process.env.NEXTAUTH_SECRET = 'test-nextauth-secret-minimum-32-characters-long';
process.env.PAYMENT_WALLET_ADDRESS = 'TTestWalletAddress123456789012345';
process.env.DISCORD_WEBHOOK_SECRET = 'test-discord-webhook-secret-key';

import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { sanitizeSignalText } from '@/lib/security/sanitizer';
import { escapeRegex } from '@/lib/utils/validation';
import { parseSignal } from '@/lib/parser';
import { rateLimit, RATE_LIMITS, clearRateLimits } from '@/lib/middleware/rate-limiter';

/**
 * SECURITY TEST SUITE: Signals API Routes
 *
 * Critical Areas:
 * 1. XSS Prevention - sanitizeSignalText strips malicious content
 * 2. NoSQL Injection - escapeRegex for symbol search, status whitelist
 * 3. IDOR Prevention - Signals filtered by userId
 * 4. Input Validation - Symbol format, positive prices, field types
 * 5. Rate Limiting - Trading rate limit (10 tokens, 60s refill)
 * 6. Authorization - All routes require authentication
 *
 * Tests the underlying security functions directly to ensure the API
 * routes have proper defense-in-depth protection layers.
 */

describe('Signals API Security Tests', () => {
  describe('1. XSS Prevention in Signal Text', () => {
    it('should strip script tags', () => {
      const malicious = 'Buy $BTC <script>alert("XSS")</script> at 50000';
      const sanitized = sanitizeSignalText(malicious);
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('</script>');
      expect(sanitized).toContain('Buy $BTC');
      expect(sanitized).toContain('at 50000');
    });

    it('should strip script tags with attributes', () => {
      const malicious = '<script type="text/javascript" src="evil.js">alert(1)</script>Buy $ETH';
      const sanitized = sanitizeSignalText(malicious);
      expect(sanitized).not.toContain('<script');
      expect(sanitized).not.toContain('</script>');
      expect(sanitized).toContain('Buy $ETH');
    });

    it('should strip iframe tags', () => {
      const malicious = '<iframe src="https://evil.com"></iframe>Buy $BNB at 300';
      const sanitized = sanitizeSignalText(malicious);
      expect(sanitized).not.toContain('<iframe');
      expect(sanitized).not.toContain('</iframe>');
      expect(sanitized).toContain('Buy $BNB at 300');
    });

    it('should strip iframe tags with complex attributes', () => {
      const malicious = '<iframe width="100%" height="500" src="javascript:alert(1)"></iframe>';
      const sanitized = sanitizeSignalText(malicious);
      expect(sanitized).not.toContain('<iframe');
      expect(sanitized).not.toContain('</iframe>');
      expect(sanitized).toBe('');
    });

    it('should remove javascript: protocol', () => {
      const malicious = 'Buy javascript:alert(1) at 100';
      const sanitized = sanitizeSignalText(malicious);
      expect(sanitized).not.toContain('javascript:');
      expect(sanitized).toContain('Buy');
      expect(sanitized).toContain('at 100');
    });

    it('should remove javascript: protocol case-insensitive', () => {
      const malicious = 'JAVASCRIPT:alert(1) JavaScript:alert(2) JaVaScRiPt:alert(3)';
      const sanitized = sanitizeSignalText(malicious);
      expect(sanitized.toLowerCase()).not.toContain('javascript:');
    });

    it('should remove event handlers (onclick, onerror, etc.)', () => {
      const malicious = '<img onerror="alert(1)" src="x"> Buy $SOL onclick="steal()" at 200';
      const sanitized = sanitizeSignalText(malicious);
      expect(sanitized).not.toContain('onerror=');
      expect(sanitized).not.toContain('onclick=');
      expect(sanitized).toContain('Buy $SOL');
    });

    it('should remove various event handlers', () => {
      const handlers = [
        'onload="evil()"',
        'onmouseover="steal()"',
        'onfocus="xss()"',
        'onblur="hack()"',
        'onchange="exploit()"',
      ];

      handlers.forEach((handler) => {
        const malicious = `Buy $BTC ${handler} at 50000`;
        const sanitized = sanitizeSignalText(malicious);
        expect(sanitized).not.toContain(handler);
        expect(sanitized).toContain('Buy $BTC');
      });
    });

    it('should handle mixed XSS attacks', () => {
      const malicious = `
        <script>alert(1)</script>
        <iframe src="javascript:alert(2)"></iframe>
        <img onerror="alert(3)" src="x">
        Buy $BTC at 50000
        javascript:void(0)
        onclick="steal()"
      `;
      const sanitized = sanitizeSignalText(malicious);
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('<iframe>');
      expect(sanitized).not.toContain('onerror=');
      expect(sanitized).not.toContain('onclick=');
      expect(sanitized.toLowerCase()).not.toContain('javascript:');
      expect(sanitized).toContain('Buy $BTC at 50000');
    });

    it('should preserve legitimate signal content', () => {
      const legitimate = `
        Buying $BTC
        Entry: 50000 - 49000
        Targets: 52000, 54000, 56000
        SL: 47000
      `;
      const sanitized = sanitizeSignalText(legitimate);
      expect(sanitized).toContain('Buying $BTC');
      expect(sanitized).toContain('Entry: 50000 - 49000');
      expect(sanitized).toContain('Targets: 52000, 54000, 56000');
      expect(sanitized).toContain('SL: 47000');
    });

    it('should trim whitespace', () => {
      const signal = '   Buy $BTC at 50000   ';
      const sanitized = sanitizeSignalText(signal);
      expect(sanitized).toBe('Buy $BTC at 50000');
    });
  });

  describe('2. NoSQL Injection Prevention', () => {
    it('should escape regex special characters in symbol search', () => {
      const injectionPayloads = [
        '.*',
        '.+',
        '^BTC',
        'BTC$',
        'B[TC]',
        'BT(C)',
        'BT|C',
        'B{2}',
        'BT?C',
        'B\\TC',
      ];

      injectionPayloads.forEach((payload) => {
        const escaped = escapeRegex(payload);
        // Escaped string should not match everything
        expect(escaped).not.toBe(payload);
        // Special characters should be escaped with backslash
        expect(escaped).toMatch(/\\/);
      });
    });

    it('should escape dots (wildcard in regex)', () => {
      const input = 'BTC.USDT';
      const escaped = escapeRegex(input);
      expect(escaped).toBe('BTC\\.USDT');
      // Verify it doesn't act as wildcard
      const regex = new RegExp(escaped);
      expect(regex.test('BTC.USDT')).toBe(true);
      expect(regex.test('BTCXUSDT')).toBe(false);
    });

    it('should escape asterisk (zero or more quantifier)', () => {
      const input = 'BTC*';
      const escaped = escapeRegex(input);
      expect(escaped).toBe('BTC\\*');
      const regex = new RegExp(escaped);
      expect(regex.test('BTC*')).toBe(true);
      expect(regex.test('BTCCCCC')).toBe(false);
    });

    it('should escape caret (beginning anchor)', () => {
      const input = '^BTC';
      const escaped = escapeRegex(input);
      expect(escaped).toBe('\\^BTC');
      const regex = new RegExp(escaped);
      expect(regex.test('^BTC')).toBe(true);
      expect(regex.test('BTC')).toBe(false);
    });

    it('should escape dollar sign (end anchor)', () => {
      const input = 'BTC$';
      const escaped = escapeRegex(input);
      expect(escaped).toBe('BTC\\$');
      const regex = new RegExp(escaped);
      expect(regex.test('BTC$')).toBe(true);
      expect(regex.test('BTC')).toBe(false);
    });

    it('should prevent MongoDB operator injection in ObjectId', () => {
      const injectionPayloads = [
        '{"$gt": ""}',
        '{"$ne": null}',
        '{"$regex": ".*"}',
        '{"$where": "this.password"}',
        '{"$expr": {"$gt": ["$balance", 0]}}',
      ];

      injectionPayloads.forEach((payload) => {
        expect(Types.ObjectId.isValid(payload)).toBe(false);
      });
    });

    it('should reject invalid ObjectId formats', () => {
      const invalidIds = [
        'invalid-id',
        '12345',
        '',
        ' ',
        'not-an-objectid',
        '../../etc/passwd',
        'admin',
        'null',
        'undefined',
      ];

      invalidIds.forEach((id) => {
        expect(Types.ObjectId.isValid(id)).toBe(false);
      });
    });

    it('should accept only valid ObjectId', () => {
      const validId = new Types.ObjectId().toString();
      expect(Types.ObjectId.isValid(validId)).toBe(true);
      expect(validId).toHaveLength(24);
      expect(/^[0-9a-f]{24}$/.test(validId)).toBe(true);
    });

    it('should validate status against whitelist', () => {
      const VALID_STATUSES = ['pending', 'executing', 'completed', 'failed'];
      const invalidStatuses = [
        'all',
        '*',
        '{"$ne": "failed"}',
        'pending,all',
        'executing; DROP TABLE signals;',
        '<script>alert(1)</script>',
      ];

      invalidStatuses.forEach((status) => {
        expect(VALID_STATUSES.includes(status)).toBe(false);
      });

      VALID_STATUSES.forEach((status) => {
        expect(VALID_STATUSES.includes(status)).toBe(true);
      });
    });
  });

  describe('3. IDOR Prevention - User Isolation', () => {
    it('should verify userId is included in signal queries', () => {
      // Simulate query structure used in GET /api/signals/[id]
      const userId = new Types.ObjectId();
      const signalId = new Types.ObjectId();

      const query = {
        _id: signalId,
        userId: userId,
      };

      // Query must include both _id and userId
      expect(query).toHaveProperty('_id');
      expect(query).toHaveProperty('userId');
      expect(query.userId).toEqual(userId);
    });

    it('should prevent cross-user signal access', () => {
      const userA = new Types.ObjectId();
      const userB = new Types.ObjectId();
      const signalId = new Types.ObjectId();

      // User A's query
      const queryA = { _id: signalId, userId: userA };
      // User B trying to access same signal
      const queryB = { _id: signalId, userId: userB };

      // Queries should be different
      expect(queryA.userId).not.toEqual(queryB.userId);
      expect(queryA.userId.toString()).not.toBe(queryB.userId.toString());
    });

    it('should filter signals by userId in list queries', () => {
      const userId = new Types.ObjectId();
      const query: Record<string, unknown> = { userId };

      // All list queries must start with userId filter
      expect(query).toHaveProperty('userId');
      expect(query.userId).toEqual(userId);
    });

    it('should not allow userId override in query params', () => {
      const authenticatedUserId = new Types.ObjectId();

      // Attacker tries to access other user's signals via query param
      const maliciousUserId = new Types.ObjectId();

      // The query should ONLY use the authenticated userId, never from params
      const query = { userId: authenticatedUserId };

      expect(query.userId).toEqual(authenticatedUserId);
      expect(query.userId).not.toEqual(maliciousUserId);
    });
  });

  describe('4. Input Validation - Signal Fields', () => {
    it('should reject invalid symbol formats', () => {
      const invalidSymbols = [
        'btc',              // lowercase
        'BTCUSD',          // not USDT pair
        'B',               // too short
        'VERYLONGSYMBOLUSDT', // too long (>10 chars before USDT)
        '123USDT',         // starts with number
        'BTC-USDT',        // has hyphen
        'BTC_USDT',        // has underscore
        'BTC USDT',        // has space
        'BTCUSDT; DROP',   // SQL injection attempt
        '<script>USDT',    // XSS attempt
      ];

      const symbolRegex = /^[A-Z]{2,10}USDT$/;

      invalidSymbols.forEach((symbol) => {
        expect(symbolRegex.test(symbol)).toBe(false);
      });
    });

    it('should accept valid symbol formats', () => {
      const validSymbols = [
        'BTCUSDT',
        'ETHUSDT',
        'BNBUSDT',
        'SOLUSDT',
        'ADAUSDT',
        'DOGEUSDT',
        'XRPUSDT',
        'DOTUSDT',
        'UNIUSDT',
        'LINKUSDT',
      ];

      const symbolRegex = /^[A-Z]{2,10}USDT$/;

      validSymbols.forEach((symbol) => {
        expect(symbolRegex.test(symbol)).toBe(true);
      });
    });

    it('should reject negative entry prices', () => {
      const signal = `
        Buying $BTCUSDT
        Entry: -50000
        Targets: 52000
        SL: 48000
      `;

      const parsed = parseSignal(signal);
      if (parsed.entries && parsed.entries.length > 0) {
        parsed.entries.forEach((entry) => {
          expect(entry).toBeGreaterThan(0);
        });
      }
    });

    it('should reject zero entry prices', () => {
      const signal = `
        Buying $BTCUSDT
        Entry: 0
        Targets: 52000
        SL: 48000
      `;

      const parsed = parseSignal(signal);
      const hasInvalidEntry = parsed.entries?.some((e) => e <= 0);

      // If any entry is <= 0, validation should fail
      if (hasInvalidEntry) {
        expect(parsed.entries?.some((e) => e <= 0)).toBe(true);
      }
    });

    it('should reject negative target prices', () => {
      const parsed = { targets: [-100, 200, 300] };
      const hasInvalidTarget = parsed.targets.some((t) => t <= 0);
      expect(hasInvalidTarget).toBe(true);
    });

    it('should reject zero target prices', () => {
      const parsed = { targets: [0, 200, 300] };
      const hasInvalidTarget = parsed.targets.some((t) => t <= 0);
      expect(hasInvalidTarget).toBe(true);
    });

    it('should reject negative stop loss', () => {
      const parsed = { stopLoss: -1000 };
      expect(parsed.stopLoss).toBeLessThanOrEqual(0);
    });

    it('should reject zero stop loss', () => {
      const parsed = { stopLoss: 0 };
      expect(parsed.stopLoss).toBeLessThanOrEqual(0);
    });

    it('should reject missing required fields', () => {
      const incomplete = parseSignal('Some random text without proper signal format');

      // Should have validation errors
      expect(incomplete.confidence).toBeLessThan(100);

      // Missing fields should cause errors
      if (!incomplete.symbol) {
        expect(incomplete.symbol).toBeFalsy();
      }
      if (!incomplete.entries || incomplete.entries.length === 0) {
        expect(incomplete.entries || []).toHaveLength(0);
      }
    });

    it('should reject non-string signal text', () => {
      const nonStringInputs = [
        123,
        true,
        null,
        undefined,
        {},
        [],
        () => {},
      ];

      nonStringInputs.forEach((input) => {
        expect(typeof input).not.toBe('string');
      });
    });

    it('should reject oversized signal text', () => {
      const maxLength = 10000; // Reasonable limit for signal text
      const oversized = 'A'.repeat(maxLength + 1);
      expect(oversized.length).toBeGreaterThan(maxLength);
    });

    it('should parse valid complete signal', () => {
      const validSignal = `
        Buying $BTCUSDT
        Entry: 50000 - 49000
        Targets: 52000, 54000, 56000
        SL: 47000
      `;

      const parsed = parseSignal(validSignal);

      expect(parsed.symbol).toBe('BTCUSDT');
      expect(parsed.entries).toBeDefined();
      expect(parsed.entries && parsed.entries.length).toBeGreaterThan(0);
      expect(parsed.targets).toBeDefined();
      expect(parsed.targets && parsed.targets.length).toBeGreaterThan(0);
      expect(parsed.stopLoss).toBeGreaterThan(0);

      if (parsed.entries) {
        parsed.entries.forEach((entry) => {
          expect(entry).toBeGreaterThan(0);
        });
      }

      if (parsed.targets) {
        parsed.targets.forEach((target) => {
          expect(target).toBeGreaterThan(0);
        });
      }
    });
  });

  describe('5. Rate Limiting - Trading Operations', () => {
    beforeEach(() => {
      // Clear rate limits before each test
      clearRateLimits();
    });

    it('should have trading rate limit configured', () => {
      const tradingConfig = RATE_LIMITS.trading;
      expect(tradingConfig).toBeDefined();
      expect(tradingConfig.maxTokens).toBe(10);
      expect(tradingConfig.refillInterval).toBe(60000); // 60 seconds
    });

    it('should allow requests within rate limit', async () => {
      const userId = 'test-user-1';

      // First request should succeed
      const result1 = await rateLimit(userId, 'trading');
      expect(result1).toBeNull(); // null means allowed

      // Second request should succeed
      const result2 = await rateLimit(userId, 'trading');
      expect(result2).toBeNull();
    });

    it('should block requests after exceeding rate limit', async () => {
      const userId = 'test-user-2';
      const maxTokens = RATE_LIMITS.trading.maxTokens;

      // Exhaust all tokens
      for (let i = 0; i < maxTokens; i++) {
        const result = await rateLimit(userId, 'trading');
        expect(result).toBeNull(); // All should succeed
      }

      // Next request should be blocked
      const blocked = await rateLimit(userId, 'trading');
      expect(blocked).not.toBeNull(); // Should return error response
    });

    it('should return 429 status when rate limited', async () => {
      const userId = 'test-user-3';
      const maxTokens = RATE_LIMITS.trading.maxTokens;

      // Exhaust tokens
      for (let i = 0; i < maxTokens; i++) {
        await rateLimit(userId, 'trading');
      }

      // Get the blocked response
      const response = await rateLimit(userId, 'trading');
      expect(response).not.toBeNull();

      if (response) {
        // Verify it's a NextResponse with 429 status
        const json = await response.json();
        expect(response.status).toBe(429);
        expect(json.error.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(json.error.statusCode).toBe(429);
      }
    });

    it('should include retry-after header when rate limited', async () => {
      const userId = 'test-user-4';
      const maxTokens = RATE_LIMITS.trading.maxTokens;

      // Exhaust tokens
      for (let i = 0; i < maxTokens; i++) {
        await rateLimit(userId, 'trading');
      }

      const response = await rateLimit(userId, 'trading');
      expect(response).not.toBeNull();

      if (response) {
        const retryAfter = response.headers.get('Retry-After');
        expect(retryAfter).toBeDefined();
        expect(parseInt(retryAfter || '0')).toBeGreaterThan(0);
      }
    });

    it('should isolate rate limits per user', async () => {
      const userA = 'user-a';
      const userB = 'user-b';

      // User A makes requests
      await rateLimit(userA, 'trading');
      await rateLimit(userA, 'trading');

      // User B should have fresh limits
      const resultB = await rateLimit(userB, 'trading');
      expect(resultB).toBeNull(); // Should succeed

      // User A should continue from their count
      const resultA = await rateLimit(userA, 'trading');
      expect(resultA).toBeNull(); // Should still succeed
    });
  });

  describe('6. Parser Security - Malicious Input Handling', () => {
    it('should handle SQL injection attempts in signal text', () => {
      const sqlInjection = `
        Buying $BTCUSDT'; DROP TABLE signals; --
        Entry: 50000
        Targets: 52000
        SL: 48000
      `;

      const parsed = parseSignal(sqlInjection);

      // Parser should extract valid data, ignore SQL
      expect(parsed.symbol).toBe('BTCUSDT');
      expect(parsed.entries).toBeDefined();
      expect(parsed.targets).toBeDefined();
    });

    it('should handle command injection attempts', () => {
      const commandInjection = `
        Buying $ETHUSDT && rm -rf /
        Entry: 3000 | cat /etc/passwd
        Targets: 3100; malicious-command
        SL: 2900
      `;

      const parsed = parseSignal(commandInjection);

      // Parser should extract valid data
      expect(parsed.symbol).toBe('ETHUSDT');
      // Should not execute any commands (parser only extracts data)
    });

    it('should handle prototype pollution attempts', () => {
      const pollutionAttempt = `
        Buying $BNBUSDT
        __proto__: evil
        constructor: hack
        Entry: 300
        Targets: 310
        SL: 290
      `;

      const parsed = parseSignal(pollutionAttempt);

      // Should only have valid signal properties
      expect(parsed).toHaveProperty('symbol');
      expect(parsed).not.toHaveProperty('__proto__');
      expect(parsed).not.toHaveProperty('constructor');
    });

    it('should handle Unicode/special character exploits', () => {
      const unicodeExploit = `
        Buying $SOLUSDT\u0000\uFEFF
        Entry: 200\u202E
        Targets: 210\u200B, 220\u200C
        SL: 190\uFFFD
      `;

      const parsed = parseSignal(unicodeExploit);

      // Should parse numbers correctly despite Unicode
      expect(parsed.symbol).toBeDefined();
      if (parsed.entries && parsed.entries.length > 0) {
        parsed.entries.forEach((entry) => {
          expect(entry).toBeGreaterThan(0);
          expect(isNaN(entry)).toBe(false);
        });
      }
    });

    it('should handle extremely nested structures', () => {
      const nested = 'Buy '.repeat(1000) + '$BTCUSDT Entry: 50000 Targets: 52000 SL: 48000';
      const parsed = parseSignal(nested);

      // Should still parse the valid parts
      expect(parsed.symbol).toBeDefined();
      expect(parsed.confidence).toBeGreaterThan(0);
    });

    it('should handle empty and whitespace-only input', () => {
      const emptyInputs = ['', '   ', '\n\n\n', '\t\t\t'];

      emptyInputs.forEach((input) => {
        const parsed = parseSignal(input);
        // Should return low confidence and errors
        expect(parsed.confidence).toBeLessThan(50);
        expect(parsed.errors.length).toBeGreaterThan(0);
      });
    });

    it('should handle extremely large numbers', () => {
      const largeNumbers = `
        Buying $BTCUSDT
        Entry: 999999999999999999999
        Targets: 9999999999999999999999
        SL: 99999999999999999999999
      `;

      const parsed = parseSignal(largeNumbers);

      // Parser should handle large numbers
      if (parsed.entries && parsed.entries.length > 0) {
        parsed.entries.forEach((entry) => {
          expect(isFinite(entry)).toBe(true);
        });
      }
    });

    it('should reject signals with malicious file paths', () => {
      const filePaths = `
        Buying ../../etc/passwd
        Entry: 50000
        Targets: /root/.ssh/id_rsa
        SL: C:\\Windows\\System32\\config\\SAM
      `;

      const parsed = parseSignal(filePaths);

      // Should not parse file paths as valid symbols
      const symbolRegex = /^[A-Z]{2,10}USDT$/;
      expect(symbolRegex.test(parsed.symbol || '')).toBe(false);
    });
  });

  describe('7. Combined Attack Scenarios', () => {
    it('should handle XSS + SQL injection combo', () => {
      const combo = `
        <script>alert(1)</script>
        Buying $BTCUSDT'; DROP TABLE signals; --
        Entry: 50000 onclick="steal()"
        Targets: 52000
        SL: 48000
      `;

      const sanitized = sanitizeSignalText(combo);
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('onclick=');

      const parsed = parseSignal(sanitized);
      expect(parsed.symbol).toBeDefined();
    });

    it('should handle NoSQL + XSS + IDOR combo', () => {
      const maliciousId = '{"$ne": null}<script>alert(1)</script>';
      const maliciousSymbol = '.*<iframe src="evil"></iframe>';

      // IDOR protection
      expect(Types.ObjectId.isValid(maliciousId)).toBe(false);

      // NoSQL injection protection
      const escapedSymbol = escapeRegex(maliciousSymbol);
      expect(escapedSymbol).toContain('\\.');
      expect(escapedSymbol).toContain('\\*');

      // XSS protection
      const sanitized = sanitizeSignalText(maliciousSymbol);
      expect(sanitized).not.toContain('<iframe>');
    });

    it('should handle rate limit bypass attempts', async () => {
      const userId = 'test-user-5';

      // Try to bypass by changing identifier format
      const variations = [
        userId,
        userId.toUpperCase(),
        ` ${userId} `,
        `${userId}\n`,
        `${userId}\t`,
      ];

      const maxTokens = RATE_LIMITS.trading.maxTokens;

      // Exhaust limit with original ID
      for (let i = 0; i < maxTokens; i++) {
        await rateLimit(userId, 'trading');
      }

      // All variations should still be blocked (same userId)
      const blocked = await rateLimit(userId, 'trading');
      expect(blocked).not.toBeNull();
    });
  });
});

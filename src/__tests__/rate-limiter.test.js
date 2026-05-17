import { describe, it, expect, beforeEach } from 'vitest';

// The rate-limiter uses a module-level Map, so we import it once.
// Each test may mutate the Map, so we rely on unique keys per test.
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';

describe('rate-limiter', () => {
  describe('checkRateLimit', () => {
    it('exports checkRateLimit function', () => {
      expect(typeof checkRateLimit).toBe('function');
    });

    it('allows a request within the limit', () => {
      const result = checkRateLimit('test-allow-key', 5, 60000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      expect(result.resetAt).toBeGreaterThan(0);
    });

    it('decrements remaining on each call', () => {
      const key = `test-decrement-${Date.now()}`;
      const r1 = checkRateLimit(key, 5, 60000);
      expect(r1.remaining).toBe(4);
      const r2 = checkRateLimit(key, 5, 60000);
      expect(r2.remaining).toBe(3);
    });

    it('blocks requests after exceeding the limit', () => {
      const key = `test-block-${Date.now()}`;
      const max = 3;
      // Use up all allowed requests
      for (let i = 0; i < max; i++) {
        checkRateLimit(key, max, 60000);
      }
      // Next request should be blocked
      const result = checkRateLimit(key, max, 60000);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('resets the window after expiry', () => {
      const key = `test-reset-${Date.now()}`;
      const windowMs = 1; // 1ms window — will expire immediately
      checkRateLimit(key, 1, windowMs);
      // Wait for the window to expire
      return new Promise((resolve) => {
        setTimeout(() => {
          const result = checkRateLimit(key, 1, windowMs);
          expect(result.allowed).toBe(true);
          resolve();
        }, 10);
      });
    });

    it('uses default values when maxRequests and windowMs are omitted', () => {
      const result = checkRateLimit(`test-defaults-${Date.now()}`);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(29); // default max is 30, first call leaves 29
    });
  });

  describe('getClientIp', () => {
    it('exports getClientIp function', () => {
      expect(typeof getClientIp).toBe('function');
    });

    it('extracts IP from x-forwarded-for header', () => {
      const req = {
        headers: {
          get: (name) => {
            if (name === 'x-forwarded-for') return '1.2.3.4, 5.6.7.8';
            return null;
          },
        },
      };
      expect(getClientIp(req)).toBe('1.2.3.4');
    });

    it('falls back to x-real-ip header', () => {
      const req = {
        headers: {
          get: (name) => {
            if (name === 'x-real-ip') return '9.8.7.6';
            return null;
          },
        },
      };
      expect(getClientIp(req)).toBe('9.8.7.6');
    });

    it('returns "unknown" when no headers are present', () => {
      const req = {
        headers: {
          get: () => null,
        },
      };
      expect(getClientIp(req)).toBe('unknown');
    });
  });
});

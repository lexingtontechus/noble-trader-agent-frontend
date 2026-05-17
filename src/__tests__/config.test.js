import { describe, it, expect } from 'vitest';
import { FASTAPI_BASE, APP_VERSION, CACHE_TTL, POLL_INTERVAL, RATE_LIMIT } from '@/lib/config';

describe('config', () => {
  it('exports FASTAPI_BASE as a string', () => {
    expect(typeof FASTAPI_BASE).toBe('string');
    expect(FASTAPI_BASE.length).toBeGreaterThan(0);
  });

  it('FASTAPI_BASE contains a URL', () => {
    expect(FASTAPI_BASE).toMatch(/^https?:\/\//);
  });

  it('exports APP_VERSION', () => {
    expect(APP_VERSION).toBeDefined();
    expect(APP_VERSION).toMatch(/^v\d+/);
  });

  it('CACHE_TTL has required keys', () => {
    expect(CACHE_TTL).toHaveProperty('PRICE_LATEST');
    expect(CACHE_TTL).toHaveProperty('PRICE_HISTORICAL');
    expect(CACHE_TTL).toHaveProperty('REDIS');
    expect(CACHE_TTL.REDIS).toHaveProperty('SNAPSHOT');
    expect(CACHE_TTL.REDIS).toHaveProperty('PRICE');
  });

  it('CACHE_TTL values are positive numbers', () => {
    expect(CACHE_TTL.PRICE_LATEST).toBeGreaterThan(0);
    expect(CACHE_TTL.PRICE_HISTORICAL).toBeGreaterThan(0);
    expect(CACHE_TTL.REDIS.SNAPSHOT).toBeGreaterThan(0);
  });

  it('POLL_INTERVAL has required keys with positive values', () => {
    expect(POLL_INTERVAL.FAST).toBeGreaterThan(0);
    expect(POLL_INTERVAL.DEFAULT).toBeGreaterThan(0);
    expect(POLL_INTERVAL.SLOW).toBeGreaterThan(0);
    expect(POLL_INTERVAL.FAST).toBeLessThan(POLL_INTERVAL.DEFAULT);
    expect(POLL_INTERVAL.DEFAULT).toBeLessThan(POLL_INTERVAL.SLOW);
  });

  it('RATE_LIMIT has price and historical limits', () => {
    expect(RATE_LIMIT.PRICE).toHaveProperty('max');
    expect(RATE_LIMIT.PRICE).toHaveProperty('windowMs');
    expect(RATE_LIMIT.HISTORICAL).toHaveProperty('max');
    expect(RATE_LIMIT.HISTORICAL).toHaveProperty('windowMs');
  });
});

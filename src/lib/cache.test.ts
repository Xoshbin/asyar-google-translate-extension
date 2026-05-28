import { describe, it, expect, vi } from 'vitest';
import { cacheKey, getCached, setCached, CACHE_TTL_MS } from './cache';

describe('cacheKey', () => {
  it('formats as tx:<from>:<to>:<sha1>', async () => {
    const k = await cacheKey('en', 'es', 'good morning');
    expect(k).toMatch(/^tx:en:es:[0-9a-f]{40}$/);
  });
  it('is deterministic for the same inputs', async () => {
    expect(await cacheKey('en', 'es', 'x'))
      .toBe(await cacheKey('en', 'es', 'x'));
  });
});

describe('getCached / setCached', () => {
  it('round-trips a TranslateResult through the cache service', async () => {
    const store = new Map<string, string>();
    const cache = {
      get: vi.fn(async (k: string) => store.get(k)),
      set: vi.fn(async (k: string, v: string) => { store.set(k, v); }),
      remove: vi.fn(async (k: string) => store.delete(k)),
      clear: vi.fn(async () => { store.clear(); }),
    };
    const value = { translatedText: 'Buenos días', detectedFrom: 'en' };
    await setCached(cache as any, 'en', 'es', 'good morning', value);
    const out = await getCached(cache as any, 'en', 'es', 'good morning');
    expect(out).toEqual(value);
    expect(cache.set).toHaveBeenCalledTimes(1);
    const [, , opts] = cache.set.mock.calls[0];
    expect((opts as any).expirationDate).toBeInstanceOf(Date);
  });

  it('returns undefined on cache miss', async () => {
    const cache = {
      get: vi.fn(async () => undefined),
      set: vi.fn(), remove: vi.fn(), clear: vi.fn(),
    };
    const out = await getCached(cache as any, 'en', 'es', 'never seen');
    expect(out).toBeUndefined();
  });

  it('returns undefined when stored value is malformed JSON', async () => {
    const cache = {
      get: vi.fn(async () => 'not-json'),
      set: vi.fn(), remove: vi.fn(), clear: vi.fn(),
    };
    const out = await getCached(cache as any, 'en', 'es', 'x');
    expect(out).toBeUndefined();
  });

  it('CACHE_TTL_MS is 24h', () => {
    expect(CACHE_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});

import type { ICacheService } from 'asyar-sdk/contracts';
import type { TranslateResult } from './translator';
import { sha1Hex } from './format';

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function cacheKey(
  from: string,
  to: string,
  text: string,
): Promise<string> {
  const hash = await sha1Hex(text);
  return `tx:${from}:${to}:${hash}`;
}

export async function getCached(
  cache: ICacheService,
  from: string,
  to: string,
  text: string,
): Promise<TranslateResult | undefined> {
  const k = await cacheKey(from, to, text);
  const raw = await cache.get(k);
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw) as TranslateResult;
  } catch {
    return undefined;
  }
}

export async function setCached(
  cache: ICacheService,
  from: string,
  to: string,
  text: string,
  value: TranslateResult,
): Promise<void> {
  const k = await cacheKey(from, to, text);
  await cache.set(k, JSON.stringify(value), {
    expirationDate: new Date(Date.now() + CACHE_TTL_MS),
  });
}

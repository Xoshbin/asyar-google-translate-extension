import { describe, it, expect } from 'vitest';
import { truncate, sha1Hex, timeAgo } from './format';

describe('truncate', () => {
  it('returns input unchanged when under the limit', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });
  it('hard-cuts and appends ellipsis when over the limit', () => {
    expect(truncate('abcdefghijklmnop', 8)).toBe('abcdefg…');
  });
  it('handles zero limit safely', () => {
    expect(truncate('hello', 0)).toBe('…');
  });
});

describe('sha1Hex', () => {
  it('matches the well-known SHA-1 of "abc"', async () => {
    expect(await sha1Hex('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
  });
  it('matches the well-known SHA-1 of an empty string', async () => {
    expect(await sha1Hex('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
  });
});

describe('timeAgo', () => {
  const NOW = new Date('2026-05-28T12:00:00Z').getTime();
  it('returns "just now" for <60s', () => {
    expect(timeAgo(NOW - 5_000, NOW)).toBe('just now');
  });
  it('returns "X min ago" for <60min', () => {
    expect(timeAgo(NOW - 5 * 60_000, NOW)).toBe('5 min ago');
  });
  it('returns "X h ago" for <24h', () => {
    expect(timeAgo(NOW - 5 * 60 * 60_000, NOW)).toBe('5 h ago');
  });
  it('returns "X d ago" for ≥24h', () => {
    expect(timeAgo(NOW - 3 * 24 * 60 * 60_000, NOW)).toBe('3 d ago');
  });
});

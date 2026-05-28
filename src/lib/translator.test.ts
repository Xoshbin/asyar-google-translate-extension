import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  translate,
  parseGoogleResponse,
  TranslateError,
} from './translator';

const FIX = (name: string) =>
  readFileSync(resolve(__dirname, '../../test-fixtures', name), 'utf8');

describe('parseGoogleResponse', () => {
  it('parses a single-sentence response', () => {
    const raw = JSON.parse(FIX('single-sentence.json'));
    const out = parseGoogleResponse(raw, /*requestedFrom*/ 'en');
    expect(out.translatedText.length).toBeGreaterThan(0);
    expect(out.detectedFrom).toBe('en');
  });

  it('concatenates multi-segment translations', () => {
    const raw = JSON.parse(FIX('multi-segment.json'));
    const out = parseGoogleResponse(raw, 'en');
    // Two sentences in input -> non-trivial multi-token translation
    expect(out.translatedText.split(/\s+/).length).toBeGreaterThanOrEqual(2);
  });

  it('extracts the detected source from auto-detect responses', () => {
    const raw = JSON.parse(FIX('auto-detect.json'));
    const out = parseGoogleResponse(raw, 'auto');
    expect(out.detectedFrom).toBe('ja');
  });

  it('extracts pronunciation when present (en→es)', () => {
    const raw = JSON.parse(FIX('single-sentence.json'));
    const out = parseGoogleResponse(raw, 'en');
    expect(out.pronunciation).toBe('ˌɡo͝od ˈmôrniNG');
  });

  it('extracts romanization for auto-detect ja→en', () => {
    const raw = JSON.parse(FIX('auto-detect.json'));
    const out = parseGoogleResponse(raw, 'auto');
    expect(out.pronunciation).toBeDefined();
    expect(out.pronunciation).toMatch(/Arigat/i);
  });

  it('throws TranslateError when the response is not an array', () => {
    expect(() => parseGoogleResponse({ not: 'an array' } as unknown, 'en'))
      .toThrow(TranslateError);
  });

  it('throws TranslateError when no translated segment produces text', () => {
    // shape: outer array OK, inner segments OK, but every segment has null seg[0]
    const raw = [[[null, null, null, 'romaji-only']], null, 'ja'];
    expect(() => parseGoogleResponse(raw, 'auto'))
      .toThrow(TranslateError);
  });
});

describe('translate', () => {
  it('builds the correct URL and parses the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: {},
      body: FIX('single-sentence.json'),
      ok: true,
    });
    const network = { fetch: fetchMock };

    const out = await translate(network as any, {
      text: 'good morning',
      from: 'en',
      to: 'es',
    });

    expect(out.translatedText.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toMatch(/^https:\/\/translate\.googleapis\.com\/translate_a\/single\?/);
    expect(url).toContain('client=gtx');
    expect(url).toContain('sl=en');
    expect(url).toContain('tl=es');
    expect(url).toContain('hl=es');
    expect(url).toContain('dt=t');
    expect(url).toContain('dt=rm');
    expect(url).toContain('q=good+morning');
  });

  it('throws TranslateError on non-2xx status', async () => {
    const network = {
      fetch: vi.fn().mockResolvedValue({
        status: 429, statusText: 'Too Many Requests', headers: {},
        body: '', ok: false,
      }),
    };
    await expect(
      translate(network as any, { text: 'x', from: 'en', to: 'es' }),
    ).rejects.toBeInstanceOf(TranslateError);
  });

  it('throws TranslateError on malformed JSON', async () => {
    const network = {
      fetch: vi.fn().mockResolvedValue({
        status: 200, statusText: 'OK', headers: {},
        body: 'not-json', ok: true,
      }),
    };
    await expect(
      translate(network as any, { text: 'x', from: 'en', to: 'es' }),
    ).rejects.toBeInstanceOf(TranslateError);
  });
});

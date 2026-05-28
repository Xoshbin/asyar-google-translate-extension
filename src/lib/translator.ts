import type { INetworkService } from 'asyar-sdk/contracts';

export type LanguageOrAuto = string;

export interface TranslateOptions {
  text: string;
  from: LanguageOrAuto;   // 'auto' or any ISO code from languages.ts
  to: string;
  /** Optional ms timeout. Defaults to 10_000. */
  timeoutMs?: number;
}

export interface TranslateResult {
  translatedText: string;
  detectedFrom: string;    // resolved ISO code, never 'auto'
  pronunciation?: string;
}

export class TranslateError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'TranslateError';
  }
}

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';

export async function translate(
  network: INetworkService,
  opts: TranslateOptions,
): Promise<TranslateResult> {
  const params = new URLSearchParams();
  params.set('client', 'gtx');
  params.set('sl', opts.from);
  params.set('tl', opts.to);
  params.set('hl', opts.to);
  params.append('dt', 't');
  params.append('dt', 'rm');
  params.set('ie', 'UTF-8');
  params.set('oe', 'UTF-8');
  params.set('q', opts.text);

  const url = `${ENDPOINT}?${params.toString()}`;
  let res;
  try {
    res = await network.fetch(url, {
      method: 'GET',
      timeout: opts.timeoutMs ?? 10_000,
    });
  } catch (err) {
    throw new TranslateError('Network request failed', err);
  }
  if (!res.ok) {
    throw new TranslateError(
      `Google Translate HTTP ${res.status} ${res.statusText}`,
    );
  }
  let raw;
  try {
    raw = JSON.parse(res.body);
  } catch (err) {
    throw new TranslateError('Could not parse Google Translate response', err);
  }
  return parseGoogleResponse(raw, opts.from);
}

export function parseGoogleResponse(
  raw: unknown,
  requestedFrom: string,
): TranslateResult {
  if (!Array.isArray(raw) || !Array.isArray(raw[0])) {
    throw new TranslateError('Unexpected Google Translate response shape');
  }
  const segments = raw[0] as unknown[];
  let translatedText = '';
  let pronunciation: string | undefined;

  // Google's response shape (with dt=t&dt=rm): translation segments have a
  // non-null seg[0] (the translated text) and a numeric seg[4]. The
  // romanization segment, when present, is a *separate* trailing segment with
  // seg[0]=null and the pronunciation string at seg[3] (older variants used
  // seg[2]). If Google ever puts pronunciation on the same segment as the
  // translation, the `else if` below would silently drop it — fine today,
  // worth knowing if behavior ever changes.
  for (const seg of segments) {
    if (!Array.isArray(seg)) continue;
    const translated = typeof seg[0] === 'string' ? (seg[0] as string) : null;
    // Google's romanization segment lives at index 3 in the real endpoint
    // response shape (when dt=rm is requested). Some segment layouts can
    // also surface it at index 2 in older/alt response variants; we accept
    // either, preferring the first one we see.
    const pron =
      typeof seg[3] === 'string' && seg[3].length > 0
        ? (seg[3] as string)
        : typeof seg[2] === 'string' && seg[2].length > 0
        ? (seg[2] as string)
        : null;
    if (translated !== null) {
      translatedText += translated;
    } else if (pron && !pronunciation) {
      pronunciation = pron;
    }
  }
  if (translatedText === '') {
    throw new TranslateError('Google Translate returned no text');
  }
  const detected = typeof raw[2] === 'string' ? (raw[2] as string) : null;
  const detectedFrom =
    detected && requestedFrom === 'auto' ? detected : requestedFrom;

  return { translatedText, detectedFrom, ...(pronunciation ? { pronunciation } : {}) };
}

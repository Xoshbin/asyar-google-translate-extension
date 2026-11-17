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
  detectedFrom: string; // resolved ISO code, never 'auto'
  pronunciation?: string;
  sourcePronunciation?: string;
  alternatives?: string[];
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
  params.append('dt', 'bd');
  params.append('dt', 'at');
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
  let sourcePronunciation: string | undefined;

  for (const seg of segments) {
    if (!Array.isArray(seg)) continue;
    const translated = typeof seg[0] === 'string' ? (seg[0] as string) : null;
    if (translated !== null) {
      translatedText += translated;
    } else {
      const p2 = typeof seg[2] === 'string' && seg[2].length > 0 ? (seg[2] as string) : null;
      const p3 = typeof seg[3] === 'string' && seg[3].length > 0 ? (seg[3] as string) : null;
      if (p2 && p3) {
        if (!pronunciation) pronunciation = p2;
        if (!sourcePronunciation) sourcePronunciation = p3;
      } else if (p3 && !pronunciation) {
        pronunciation = p3;
      } else if (p2 && !pronunciation) {
        pronunciation = p2;
      }
    }
  }
  if (translatedText === '') {
    throw new TranslateError('Google Translate returned no text');
  }

  const alternatives: string[] = [];
  if (Array.isArray((raw as unknown[])[5])) {
    for (const item of (raw as unknown[])[5] as unknown[]) {
      if (Array.isArray(item) && Array.isArray(item[2])) {
        for (const altTuple of item[2] as unknown[]) {
          if (Array.isArray(altTuple) && typeof altTuple[0] === 'string') {
            const altText = altTuple[0].trim();
            if (
              altText &&
              altText.toLowerCase() !== translatedText.toLowerCase() &&
              !alternatives.includes(altText)
            ) {
              alternatives.push(altText);
            }
          }
        }
      }
    }
  }

  const detected = typeof (raw as unknown[])[2] === 'string' ? ((raw as unknown[])[2] as string) : null;
  const detectedFrom =
    detected && requestedFrom === 'auto' ? detected : requestedFrom;

  return {
    translatedText,
    detectedFrom,
    ...(pronunciation ? { pronunciation } : {}),
    ...(sourcePronunciation ? { sourcePronunciation } : {}),
    ...(alternatives.length > 0 ? { alternatives } : {}),
  };
}

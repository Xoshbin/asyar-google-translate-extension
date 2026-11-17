import { labelOf, isRtlLanguage } from './languages';
import type { TranslateResult } from './translator';

export interface TranslationRow {
  id: string;
  text: string;
  lang: string;
  tag: string;
  kind: 'translation' | 'pronunciation' | 'reverse' | 'reverse-pronunciation' | 'alternative';
  isRtl: boolean;
}

export function computeAccessoryButtonTitle(source: string, target: string): string {
  const sLabel = source === 'auto' ? 'Auto-Detect' : labelOf(source);
  const tLabel = labelOf(target);
  return `${sLabel} → ${tLabel}`;
}

export function cycleTargetLanguage(
  currentTarget: string,
  direction: 1 | -1,
  pool: readonly string[],
): string {
  const idx = pool.indexOf(currentTarget);
  if (idx === -1) return pool[0] ?? currentTarget;
  const nextIdx = (idx + direction + pool.length) % pool.length;
  return pool[nextIdx];
}

export function buildTranslationRows(
  forward: TranslateResult | null,
  reverse: TranslateResult | null,
  source: string,
  target: string,
): TranslationRow[] {
  if (!forward || !forward.translatedText) return [];

  const effSource = forward.detectedFrom || (source === 'auto' ? 'en' : source);
  const sLabel = labelOf(effSource);
  const tLabel = labelOf(target);
  const rows: TranslationRow[] = [];

  // 1. Primary forward translation
  rows.push({
    id: 'fwd-main',
    text: forward.translatedText,
    lang: target,
    tag: `${sLabel} → ${tLabel}`,
    kind: 'translation',
    isRtl: isRtlLanguage(target),
  });

  // 2. Forward pronunciation / romanization
  if (
    forward.pronunciation &&
    forward.pronunciation.trim() !== forward.translatedText.trim()
  ) {
    rows.push({
      id: 'fwd-pron',
      text: forward.pronunciation,
      lang: target,
      tag: `${sLabel} → ${tLabel}`,
      kind: 'pronunciation',
      isRtl: false,
    });
  }

  // 3. Reverse primary translation
  if (reverse && reverse.translatedText) {
    rows.push({
      id: 'rev-main',
      text: reverse.translatedText,
      lang: effSource,
      tag: `${tLabel} → ${sLabel}`,
      kind: 'reverse',
      isRtl: isRtlLanguage(effSource),
    });
  }

  // 4. Reverse pronunciation
  if (
    reverse?.pronunciation &&
    reverse.pronunciation.trim() !== reverse.translatedText.trim()
  ) {
    rows.push({
      id: 'rev-pron',
      text: reverse.pronunciation,
      lang: effSource,
      tag: `${tLabel} → ${sLabel}`,
      kind: 'reverse-pronunciation',
      isRtl: false,
    });
  }

  // 5. Alternatives (up to 3)
  if (forward.alternatives && forward.alternatives.length > 0) {
    for (let i = 0; i < Math.min(3, forward.alternatives.length); i++) {
      const alt = forward.alternatives[i];
      if (!rows.some((row) => row.text.toLowerCase() === alt.toLowerCase())) {
        rows.push({
          id: `alt-${i}`,
          text: alt,
          lang: target,
          tag: `${sLabel} → ${tLabel}`,
          kind: 'alternative',
          isRtl: isRtlLanguage(target),
        });
      }
    }
  }

  return rows;
}

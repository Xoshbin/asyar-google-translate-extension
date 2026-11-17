import { describe, it, expect } from 'vitest';
import {
  buildTranslationRows,
  computeAccessoryButtonTitle,
  cycleTargetLanguage,
} from './rows';

describe('computeAccessoryButtonTitle', () => {
  it('formats Auto-Detect when source is auto', () => {
    expect(computeAccessoryButtonTitle('auto', 'ckb')).toBe(
      'Auto-Detect → Kurdish (Sorani)',
    );
  });

  it('formats specific source language name', () => {
    expect(computeAccessoryButtonTitle('en', 'es')).toBe('English → Spanish');
  });
});

describe('cycleTargetLanguage', () => {
  const pool = ['ckb', 'en', 'es', 'fr'];

  it('cycles forward', () => {
    expect(cycleTargetLanguage('ckb', 1, pool)).toBe('en');
    expect(cycleTargetLanguage('fr', 1, pool)).toBe('ckb');
  });

  it('cycles backward', () => {
    expect(cycleTargetLanguage('ckb', -1, pool)).toBe('fr');
    expect(cycleTargetLanguage('es', -1, pool)).toBe('en');
  });
});

describe('buildTranslationRows', () => {
  it('returns empty array when forward result is null or empty', () => {
    expect(buildTranslationRows(null, null, 'auto', 'en')).toEqual([]);
    expect(
      buildTranslationRows(
        { translatedText: '', detectedFrom: 'en' },
        null,
        'auto',
        'en',
      ),
    ).toEqual([]);
  });

  it('constructs forward, pronunciation, reverse, and reverse pronunciation rows matching Raycast', () => {
    const forward = {
      translatedText: 'سڵاو',
      detectedFrom: 'en',
      pronunciation: 'sllaw',
    };
    const reverse = {
      translatedText: 'Hello',
      detectedFrom: 'ckb',
      pronunciation: 'sllaw',
    };

    const rows = buildTranslationRows(forward, reverse, 'auto', 'ckb');

    expect(rows).toHaveLength(4);
    // Row 1: Forward Translation
    expect(rows[0]).toEqual({
      id: 'fwd-main',
      text: 'سڵاو',
      lang: 'ckb',
      tag: 'English → Kurdish (Sorani)',
      kind: 'translation',
      isRtl: true,
    });
    // Row 2: Forward Pronunciation
    expect(rows[1]).toEqual({
      id: 'fwd-pron',
      text: 'sllaw',
      lang: 'ckb',
      tag: 'English → Kurdish (Sorani)',
      kind: 'pronunciation',
      isRtl: false,
    });
    // Row 3: Reverse Translation
    expect(rows[2]).toEqual({
      id: 'rev-main',
      text: 'Hello',
      lang: 'en',
      tag: 'Kurdish (Sorani) → English',
      kind: 'reverse',
      isRtl: false,
    });
    // Row 4: Reverse Pronunciation
    expect(rows[3]).toEqual({
      id: 'rev-pron',
      text: 'sllaw',
      lang: 'en',
      tag: 'Kurdish (Sorani) → English',
      kind: 'reverse-pronunciation',
      isRtl: false,
    });
  });

  it('includes alternative translations when present', () => {
    const forward = {
      translatedText: 'Hola',
      detectedFrom: 'en',
      alternatives: ['saludos', 'buenos días'],
    };
    const reverse = {
      translatedText: 'Hello',
      detectedFrom: 'es',
    };

    const rows = buildTranslationRows(forward, reverse, 'auto', 'es');
    expect(rows.map((r) => r.text)).toEqual([
      'Hola',
      'Hello',
      'saludos',
      'buenos días',
    ]);
  });
});

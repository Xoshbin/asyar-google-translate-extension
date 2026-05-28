import { describe, it, expect } from 'vitest';
import {
  LANGUAGES,
  isLanguageCode,
  labelOf,
  type LanguageCode,
} from './languages';

describe('languages', () => {
  it('has at least 40 entries', () => {
    expect(LANGUAGES.length).toBeGreaterThanOrEqual(40);
  });

  it('every entry has code, name, native', () => {
    for (const lang of LANGUAGES) {
      expect(lang.code).toMatch(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/);
      expect(lang.name).not.toBe('');
      expect(lang.native).not.toBe('');
    }
  });

  it('codes are unique', () => {
    const codes = new Set(LANGUAGES.map((l) => l.code));
    expect(codes.size).toBe(LANGUAGES.length);
  });

  it('includes English, Spanish, French, Arabic, Japanese, Chinese', () => {
    const codes = new Set(LANGUAGES.map((l) => l.code));
    expect(codes.has('en')).toBe(true);
    expect(codes.has('es')).toBe(true);
    expect(codes.has('fr')).toBe(true);
    expect(codes.has('ar')).toBe(true);
    expect(codes.has('ja')).toBe(true);
    expect(codes.has('zh-CN')).toBe(true);
  });

  it('isLanguageCode narrows correctly', () => {
    expect(isLanguageCode('en')).toBe(true);
    expect(isLanguageCode('zz')).toBe(false);
    expect(isLanguageCode('')).toBe(false);
  });

  it('labelOf returns the English name for known codes', () => {
    expect(labelOf('en' as LanguageCode)).toBe('English');
    expect(labelOf('ja' as LanguageCode)).toBe('Japanese');
  });

  it('labelOf falls back to uppercased code for unknown codes', () => {
    expect(labelOf('zz' as LanguageCode)).toBe('ZZ');
  });
});

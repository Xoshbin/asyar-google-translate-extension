import { describe, it, expect } from 'vitest';
import { VIEW_ACTION_NAMES, viewActionId } from './actions';

describe('viewActionId', () => {
  it('formats id with extensionId and name', () => {
    expect(viewActionId('org.asyar.google-translate', 'copy-translation')).toBe(
      'org.asyar.google-translate.view.copy-translation',
    );
    expect(viewActionId('org.asyar.google-translate', 'swap')).toBe(
      'org.asyar.google-translate.view.swap',
    );
  });

  it('contains all 9 expected view actions', () => {
    expect(VIEW_ACTION_NAMES).toHaveLength(9);
    expect(VIEW_ACTION_NAMES).toContain('copy-translation');
    expect(VIEW_ACTION_NAMES).toContain('paste-translation');
    expect(VIEW_ACTION_NAMES).toContain('toggle-full-text');
    expect(VIEW_ACTION_NAMES).toContain('play-tts');
    expect(VIEW_ACTION_NAMES).toContain('open-google-translate');
    expect(VIEW_ACTION_NAMES).toContain('prev-lang-set');
    expect(VIEW_ACTION_NAMES).toContain('next-lang-set');
    expect(VIEW_ACTION_NAMES).toContain('swap');
    expect(VIEW_ACTION_NAMES).toContain('open-history');
  });
});

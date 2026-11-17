<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    ClipboardItemType,
    type INetworkService,
    type IClipboardHistoryService,
    type IFeedbackService,
    type IStorageService,
    type ICacheService,
    type ISelectionService,
  } from 'asyar-sdk/contracts';
  import { translate, TranslateError, type TranslateResult } from '../lib/translator';
  import { getCached, setCached } from '../lib/cache';
  import { isLanguageCode, labelOf } from '../lib/languages';

  interface SearchBarAccessoryLike {
    onChange(handler: (value: string) => void): () => void;
    set(opts: { value?: string; options?: Array<{ value: string; title: string }> }): Promise<void>;
  }

  interface Props {
    context: {
      preferences: { values: Record<string, unknown> };
      request: <T = unknown>(id: string, payload?: unknown, opts?: { timeoutMs?: number }) => Promise<T>;
      hideLauncher: () => void;
    };
    network: INetworkService;
    clipboard: IClipboardHistoryService;
    feedback: IFeedbackService;
    storage: IStorageService;
    cache: ICacheService;
    selection: ISelectionService;
    searchBarAccessory: SearchBarAccessoryLike;
    extensionId: string;
  }
  let {
    context, network, clipboard, feedback, storage, cache, selection,
    searchBarAccessory, extensionId: _extensionId,
  }: Props = $props();

  let status     = $state<'loading' | 'ready' | 'no-selection' | 'error'>('loading');
  let sourceText = $state('');
  let result     = $state<TranslateResult | null>(null);
  let targetLang = $state('en');
  let errorMsg   = $state<string | null>(null);

  const TARGET_KEY = 'ui:targetLang';

  // Skip the very first onChange firing — the SDK emits the seed value on mount,
  // which would race with runOnce()'s own translate call.
  let accessorySeeded = false;
  let accessoryDispose: (() => void) | null = null;

  function clipboardTextItem(content: string) {
    return {
      id: `gt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: ClipboardItemType.Text,
      content,
      createdAt: Date.now(),
      favorite: false,
    };
  }

  async function readTarget(): Promise<string> {
    const stored = await storage.get(TARGET_KEY);
    if (typeof stored === 'string' && isLanguageCode(stored)) return stored;
    const prefs = context.preferences.values as Record<string, unknown>;
    const pref = prefs?.targetLang;
    if (typeof pref === 'string' && isLanguageCode(pref)) return pref;
    return 'en';
  }

  async function readSourcePref(): Promise<string> {
    const prefs = context.preferences.values as Record<string, unknown>;
    const pref = prefs?.sourceLang;
    if (typeof pref === 'string' && (pref === 'auto' || isLanguageCode(pref))) return pref;
    return 'auto';
  }

  async function readSelectionAction(): Promise<'copy' | 'paste' | 'hud'> {
    const prefs = context.preferences.values as Record<string, unknown>;
    const v = prefs?.selectionAction;
    if (v === 'paste' || v === 'hud') return v;
    return 'copy';
  }

  // Translate `text` into `to`, update view state, fire history RPC, and
  // apply the side-effecting `selectionAction` if requested.
  async function translateInto(text: string, to: string, applyAction: boolean) {
    targetLang = to;
    try {
      const from = await readSourcePref();
      let r = await getCached(cache, from, to, text);
      if (!r) {
        r = await translate(network, { text, from, to });
        await setCached(cache, from, to, text, r);
      }
      result = r;
      status = 'ready';
      void context.request('translate-completed', {
        from: r.detectedFrom,
        to: targetLang,
        sourceText: text,
        translatedText: r.translatedText,
        pronunciation: r.pronunciation,
      }).catch(() => { /* best-effort */ });
      if (applyAction) {
        await applySelectionAction(text);
      }
    } catch (err) {
      errorMsg = err instanceof TranslateError
        ? err.message
        : err instanceof Error ? err.message : 'Translation failed.';
      status = 'error';
    }
  }

  async function applySelectionAction(text: string): Promise<void> {
    const mode = await readSelectionAction();
    if (mode === 'paste') {
      await clipboard.writeToClipboard(clipboardTextItem(text));
      void clipboard.simulatePaste();
    } else if (mode === 'hud') {
      await clipboard.writeToClipboard(clipboardTextItem(text));
      void feedback.showHUD('Copied to clipboard');
    } else {
      await clipboard.writeToClipboard(clipboardTextItem(text));
    }
  }

  /** `⏎`: copy the translation and dismiss the view. */
  async function copyAndDismiss() {
    if (!result) return;
    await clipboard.writeToClipboard(clipboardTextItem(result.translatedText));
    void feedback.showHUD('Copied to clipboard');
    context.hideLauncher();
  }

  /** `⌘⏎`: paste directly into the frontmost app, then dismiss. */
  async function pasteAndDismiss() {
    if (!result) return;
    await clipboard.writeToClipboard(clipboardTextItem(result.translatedText));
    const pasted = await clipboard.simulatePaste();
    if (!pasted) {
      void feedback.showHUD('Copied to clipboard');
    }
    context.hideLauncher();
  }

  async function runOnce() {
    let text: string | null = null;
    try {
      text = await selection.getSelectedText();
    } catch (err) {
      errorMsg = err instanceof Error
        ? `Could not read selection: ${err.message}`
        : 'Could not read selection.';
      status = 'error';
      return;
    }
    if (!text || text.trim() === '') {
      status = 'no-selection';
      return;
    }
    sourceText = text;
    const to = await readTarget();
    await translateInto(text, to, /*applyAction*/ true);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (status !== 'ready') return;
    if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
      event.preventDefault();
      void copyAndDismiss();
      return;
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void pasteAndDismiss();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      context.hideLauncher();
    }
  }

  onMount(() => {
    void runOnce();
    window.addEventListener('keydown', handleKeydown);

    // Wire the search-bar accessory dropdown. The SDK fires onChange once on
    // mount with the seed value — skip that one to avoid double-translating.
    accessoryDispose = searchBarAccessory.onChange((value: string) => {
      if (!accessorySeeded) {
        accessorySeeded = true;
        return;
      }
      if (!isLanguageCode(value)) return;
      void storage.set(TARGET_KEY, value);
      if (sourceText) {
        void translateInto(sourceText, value, /*applyAction*/ false);
      } else {
        targetLang = value;
      }
    });
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
    accessoryDispose?.();
  });
</script>

<div class="selection-result">
  {#if status === 'loading'}
    <p class="msg">Reading selection…</p>
  {:else if status === 'no-selection'}
    <p class="msg">No text selected in the frontmost app.</p>
    <p class="hint">Select some text in another app, then run "Translate Selection" again.</p>
  {:else if status === 'error'}
    <p class="msg error">Translation failed.</p>
    {#if errorMsg}<p class="hint">{errorMsg}</p>{/if}
  {:else if result}
    <header class="meta">
      <span>{result?.detectedFrom ? labelOf(result.detectedFrom) : 'Auto-detect'} → {labelOf(targetLang)}</span>
    </header>
    <p class="src">{sourceText}</p>
    <p class="translated" lang={targetLang}>{result.translatedText}</p>
    {#if result.pronunciation}
      <p class="pron">{result.pronunciation}</p>
    {/if}
    <p class="hint">⏎ copies and closes • ⌘⏎ pastes to frontmost app • Esc closes</p>
  {/if}
</div>

<style>
  :global(html, body) {
    height: 100%;
    margin: 0;
    padding: 0;
  }
  :global(#app) {
    height: 100%;
    width: 100%;
  }
  .selection-result {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    height: 100%;
    font-family: var(--font-ui);
    color: var(--text-primary);
  }
  .meta {
    display: flex;
    align-items: baseline;
    gap: var(--space-1);
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    margin: 0;
  }
  .src {
    color: var(--text-secondary);
    margin: 0;
    padding: var(--space-2) var(--space-3);
    background: var(--bg-tertiary);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    white-space: pre-wrap;
    font-family: var(--font-ui);
  }
  .translated {
    color: var(--text-primary);
    font-size: var(--font-size-xl);
    line-height: 1.45;
    margin: 0;
    white-space: pre-wrap;
    font-family: var(--font-ui);
  }
  .pron {
    color: var(--text-secondary);
    font-style: italic;
    font-size: var(--font-size-sm);
    margin: 0;
  }
  .msg {
    color: var(--text-primary);
    margin: 0;
  }
  .msg.error { color: var(--accent-danger); }
  .hint {
    color: var(--text-tertiary);
    font-size: var(--font-size-sm);
    margin: 0;
  }
</style>

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    ClipboardItemType,
    type INetworkService,
    type IClipboardHistoryService,
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
    };
    network: INetworkService;
    clipboard: IClipboardHistoryService;
    storage: IStorageService;
    cache: ICacheService;
    selection: ISelectionService;
    searchBarAccessory: SearchBarAccessoryLike;
    extensionId: string;
  }
  let {
    context, network, clipboard, storage, cache, selection,
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
      errorMsg = null;

      if (applyAction) {
        const action = await readSelectionAction();
        if (action === 'copy' || action === 'paste') {
          await clipboard.writeToClipboard(clipboardTextItem(r.translatedText));
        }
        if (action === 'paste') {
          await clipboard.simulatePaste();
        }
      } else {
        // Re-translation triggered by the user picking a new target via ⌘P —
        // we don't re-paste (jarring) but we DO keep the clipboard updated so
        // they can paste the new translation manually.
        await clipboard.writeToClipboard(clipboardTextItem(r.translatedText));
      }

      // Fire-and-forget worker RPC so history is recorded.
      void context.request('translate-completed', {
        from: r.detectedFrom,
        to,
        sourceText: text,
        translatedText: r.translatedText,
        pronunciation: r.pronunciation,
      }).catch(() => { /* best-effort */ });
    } catch (err) {
      errorMsg = err instanceof TranslateError
        ? err.message
        : err instanceof Error ? err.message : 'Translation failed.';
      status = 'error';
    }
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

  onMount(() => {
    void runOnce();

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
    <p class="msg error">Translate failed.</p>
    {#if errorMsg}<p class="hint">{errorMsg}</p>{/if}
  {:else if result}
    <header class="meta">
      <span>{labelOf(result.detectedFrom)} → {labelOf(targetLang)}</span>
    </header>
    <p class="src">{sourceText}</p>
    <p class="translated" lang={targetLang}>{result.translatedText}</p>
    {#if result.pronunciation}
      <p class="pron">{result.pronunciation}</p>
    {/if}
    <p class="hint">Copied to clipboard. Press Esc to close.</p>
  {/if}
</div>

<style>
  .selection-result {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
  }
  .meta {
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
  }
  .src {
    color: var(--text-secondary);
    margin: 0;
    padding: var(--space-2) var(--space-3);
    background: var(--bg-tertiary);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
  }
  .translated {
    color: var(--text-primary);
    font-size: var(--font-size-xl);
    line-height: 1.4;
    margin: 0;
    white-space: pre-wrap;
  }
  .pron {
    color: var(--text-secondary);
    font-style: italic;
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

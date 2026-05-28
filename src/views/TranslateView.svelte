<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    ClipboardItemType,
    type INetworkService,
    type IActionService,
    type IClipboardHistoryService,
    type IStorageService,
    type ICacheService,
    type IInteropService,
  } from 'asyar-sdk/contracts';
  import { translate, TranslateError, type TranslateResult } from '../lib/translator';
  import { getCached, setCached } from '../lib/cache';
  import { labelOf, isLanguageCode } from '../lib/languages';

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
    actions: IActionService;
    clipboard: IClipboardHistoryService;
    storage: IStorageService;
    cache: ICacheService;
    interop: IInteropService;
    searchBarAccessory: SearchBarAccessoryLike;
    extensionId: string;
  }
  let {
    context, network, actions, clipboard, storage, cache, interop,
    searchBarAccessory, extensionId,
  }: Props = $props();

  let sourceText = $state('');
  let target     = $state('en');
  let source     = $state<'auto' | string>('auto');
  let result     = $state<TranslateResult | null>(null);
  let loading    = $state(false);
  let error      = $state<string | null>(null);

  const TARGET_KEY  = 'ui:targetLang';
  const PENDING_KEY = 'ui:pendingQuery';

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let reqSeq = 0;

  const ACTION_SWAP      = $derived(`act_${extensionId}_swap`);
  const ACTION_COPY_PRON = $derived(`act_${extensionId}_copy-pron`);
  const ACTION_OPEN_HIST = $derived(`act_${extensionId}_open-history`);

  function clipboardTextItem(content: string) {
    return {
      id: `gt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: ClipboardItemType.Text,
      content,
      createdAt: Date.now(),
      favorite: false,
    };
  }

  function handleHostMessage(event: MessageEvent) {
    if (event.source !== window.parent) return;
    if (event.data?.type === 'asyar:view:search') {
      sourceText = event.data.payload?.query ?? '';
      scheduleTranslate();
    }
  }

  function scheduleTranslate() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runTranslate, 350);
  }

  function emitHistoryRpc(text: string, r: TranslateResult) {
    // Fire-and-forget — worker writes history; we don't await the reply.
    void context.request('translate-completed', {
      from: r.detectedFrom,
      to: target,
      sourceText: text,
      translatedText: r.translatedText,
      pronunciation: r.pronunciation,
    }).catch(() => {
      // History is best-effort; don't surface a failure to the user.
    });
  }

  async function runTranslate() {
    const text = sourceText.trim();
    if (text === '') {
      result = null;
      error = null;
      loading = false;
      return;
    }
    const mySeq = ++reqSeq;
    loading = true;
    error = null;
    try {
      const cached = await getCached(cache, source, target, text);
      if (mySeq !== reqSeq) return; // stale — bail
      if (cached) {
        result = cached;
        loading = false;
        emitHistoryRpc(text, cached);
        return;
      }
      const r = await translate(network, { text, from: source, to: target });
      if (mySeq !== reqSeq) return; // stale — bail
      await setCached(cache, source, target, text, r);
      result = r;
      emitHistoryRpc(text, r);
    } catch (err) {
      if (mySeq !== reqSeq) return; // stale — bail
      result = null;
      error = err instanceof TranslateError ? err.message : 'Translation failed.';
    } finally {
      if (mySeq === reqSeq) loading = false;
    }
  }

  async function copyPronunciation() {
    if (!result?.pronunciation) return;
    await clipboard.writeToClipboard(clipboardTextItem(result.pronunciation));
  }

  async function swap() {
    if (source === 'auto') {
      source = result?.detectedFrom ?? target;
    }
    const tmp = source;
    source = target;
    target = tmp;
    await storage.set(TARGET_KEY, target);
    scheduleTranslate();
  }

  async function openHistory() {
    await interop.launchCommand(extensionId, 'history');
  }

  let accessoryDispose: (() => void) | null = null;

  onMount(async () => {
    window.addEventListener('message', handleHostMessage);

    // Seed sticky target from storage.
    const stored = await storage.get(TARGET_KEY);
    if (typeof stored === 'string' && isLanguageCode(stored)) {
      target = stored;
    }

    // Source language from preferences.
    const prefs = context.preferences.values as Record<string, unknown>;
    const sPref = prefs?.sourceLang;
    if (typeof sPref === 'string' && (sPref === 'auto' || isLanguageCode(sPref))) {
      source = sPref;
    }

    // Pending query from worker.search() click.
    const pending = await storage.get(PENDING_KEY);
    if (typeof pending === 'string' && pending) {
      sourceText = pending;
      await storage.delete(PENDING_KEY);
      scheduleTranslate();
    }

    // Search-bar accessory.
    accessoryDispose = searchBarAccessory.onChange((value: string) => {
      if (isLanguageCode(value)) {
        target = value;
        void storage.set(TARGET_KEY, target);
        scheduleTranslate();
      }
    });

    // Register handlers for manifest-declared actions.
    actions.registerActionHandler(ACTION_SWAP,      swap);
    actions.registerActionHandler(ACTION_COPY_PRON, copyPronunciation);
    actions.registerActionHandler(ACTION_OPEN_HIST, openHistory);
  });

  onDestroy(() => {
    window.removeEventListener('message', handleHostMessage);
    accessoryDispose?.();
    if (debounceTimer) clearTimeout(debounceTimer);
  });
</script>

<div class="translate">
  <header class="translate__meta">
    <span class="lang">
      Source:
      {#if source === 'auto'}
        {result?.detectedFrom ? `auto — detected ${labelOf(result.detectedFrom)}` : 'auto'}
      {:else}
        {labelOf(source)}
      {/if}
    </span>
    <span class="arrow">→</span>
    <span class="lang">{labelOf(target)}</span>
  </header>

  {#if loading}
    <div class="translate__loading">Translating…</div>
  {:else if error}
    <div class="translate__error">{error}</div>
  {:else if result}
    <p class="translate__output" lang={target}>{result.translatedText}</p>
    {#if result.pronunciation}
      <p class="translate__pron">{result.pronunciation}</p>
    {/if}
  {:else}
    <p class="translate__hint">Type in the search bar to translate. ⌘P to change target language.</p>
  {/if}
</div>

<style>
  .translate {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
  }
  .translate__meta {
    display: flex;
    gap: var(--space-2);
    align-items: baseline;
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
  }
  .translate__meta .arrow { color: var(--text-tertiary); }
  .translate__output {
    color: var(--text-primary);
    font-size: var(--font-size-xl);
    line-height: 1.4;
    white-space: pre-wrap;
    margin: 0;
  }
  .translate__pron {
    color: var(--text-secondary);
    font-style: italic;
    margin: 0;
  }
  .translate__loading,
  .translate__hint {
    color: var(--text-tertiary);
  }
  .translate__error { color: var(--accent-danger); }
</style>

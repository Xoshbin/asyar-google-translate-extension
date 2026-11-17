<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    ActionContext,
    ClipboardItemType,
    type INetworkService,
    type IActionService,
    type IClipboardHistoryService,
    type IFeedbackService,
    type IStorageService,
    type ICacheService,
    type IInteropService,
  } from 'asyar-sdk/contracts';
  import { translate, TranslateError, type TranslateResult } from '../lib/translator';
  import { getCached, setCached } from '../lib/cache';
  import { labelOf, isLanguageCode, isRtlLanguage, LANGUAGES } from '../lib/languages';
  import {
    buildTranslationRows,
    computeAccessoryButtonTitle,
    cycleTargetLanguage,
    type TranslationRow,
  } from '../lib/rows';
  import { VIEW_ACTION_NAMES, viewActionId } from '../lib/actions';

  interface Props {
    context: {
      preferences: { values: Record<string, unknown> };
      request: <T = unknown>(
        id: string,
        payload?: unknown,
        opts?: { timeoutMs?: number },
      ) => Promise<T>;
    };
    network: INetworkService;
    actions: IActionService;
    clipboard: IClipboardHistoryService;
    feedback: IFeedbackService;
    storage: IStorageService;
    cache: ICacheService;
    interop: IInteropService;
    searchBarAccessory: SearchBarAccessoryLike;
    extensionId: string;
    extensionManager?: {
      setActiveViewActionLabel?: (label: string) => void;
    };
  }

  let {
    context,
    network,
    actions,
    clipboard,
    feedback,
    storage,
    cache,
    interop,
    searchBarAccessory,
    extensionId,
    extensionManager,
  }: Props = $props();

  const POPULAR_TARGETS = ['ckb', 'en', 'es', 'fr', 'de', 'ar', 'tr', 'it', 'ja', 'zh-CN', 'ru'];
  const TARGET_KEY = 'ui:targetLang';
  const PENDING_KEY = 'ui:pendingQuery';

  let sourceText = $state('');
  let target = $state('en');
  let source = $state<'auto' | string>('auto');
  let result = $state<TranslateResult | null>(null);
  let reverseResult = $state<TranslateResult | null>(null);
  let rows = $state<TranslationRow[]>([]);
  let selectedIndex = $state(0);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let fullTextOpen = $state(false);

  let listEl = $state<HTMLUListElement | null>(null);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let reqSeq = 0;
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

  function handleHostMessage(event: MessageEvent) {
    if (event.source !== window.parent) return;
    if (event.data?.type === 'asyar:view:search') {
      sourceText = event.data.payload?.query ?? '';
      scheduleTranslate();
    }
  }

  function scheduleTranslate() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runTranslate, 300);
  }

  function updateAccessoryTitle() {
    const buttonTitle = computeAccessoryButtonTitle(source, target);
    void searchBarAccessory.set({
      value: target,
      buttonTitle,
    });
  }

  function emitHistoryRpc(text: string, r: TranslateResult) {
    void context
      .request('translate-completed', {
        from: r.detectedFrom,
        to: target,
        sourceText: text,
        translatedText: r.translatedText,
        pronunciation: r.pronunciation,
      })
      .catch(() => {
        // History is best-effort
      });
  }

  async function runTranslate() {
    const text = sourceText.trim();
    if (text === '') {
      result = null;
      reverseResult = null;
      rows = [];
      error = null;
      loading = false;
      selectedIndex = 0;
      return;
    }

    const mySeq = ++reqSeq;
    loading = true;
    error = null;

    try {
      // 1. Forward translation
      let r = await getCached(cache, source, target, text);
      if (mySeq !== reqSeq) return;
      if (!r) {
        r = await translate(network, { text, from: source, to: target });
        if (mySeq !== reqSeq) return;
        await setCached(cache, source, target, text, r);
      }
      result = r;
      error = null;
      void emitHistoryRpc(text, r);

      // 2. Reverse translation (for forward result back into detected/source language)
      const effSource = r.detectedFrom || (source === 'auto' ? 'en' : source);
      let rev: TranslateResult | null = null;
      if (r.translatedText && effSource.toLowerCase() !== target.toLowerCase()) {
        try {
          rev = await getCached(cache, target, effSource, r.translatedText);
          if (mySeq !== reqSeq) return;
          if (!rev) {
            rev = await translate(network, {
              text: r.translatedText,
              from: target,
              to: effSource,
            });
            if (mySeq !== reqSeq) return;
            await setCached(cache, target, effSource, r.translatedText, rev);
          }
        } catch {
          // Reverse translation is best effort
        }
      }
      reverseResult = rev;
      rows = buildTranslationRows(r, rev, source, target);
      selectedIndex = Math.min(selectedIndex, Math.max(0, rows.length - 1));
      updateAccessoryTitle();
    } catch (err) {
      if (mySeq !== reqSeq) return;
      error = err instanceof TranslateError ? err.message : 'Translation failed.';
      result = null;
      reverseResult = null;
      rows = [];
    } finally {
      if (mySeq === reqSeq) loading = false;
    }
  }

  function getSelectedRow(): TranslationRow | null {
    return rows[selectedIndex] ?? null;
  }

  /** Copy selected translation to clipboard */
  async function copyTranslation() {
    const row = getSelectedRow();
    if (!row) return;
    await clipboard.writeToClipboard(clipboardTextItem(row.text));
    void feedback.showHUD('Copied to clipboard');
  }

  /** Paste translation to frontmost app */
  async function pasteTranslation() {
    const row = getSelectedRow();
    if (!row) return;
    await clipboard.writeToClipboard(clipboardTextItem(row.text));
    if (typeof (clipboard as any).hideWindow === 'function') {
      await (clipboard as any).hideWindow();
    }
    if (typeof (clipboard as any).simulatePaste === 'function') {
      await (clipboard as any).simulatePaste();
    }
    void feedback.showHUD('Pasted to frontmost app');
  }

  /** Toggle full-text large preview overlay */
  function toggleFullText() {
    fullTextOpen = !fullTextOpen;
  }

  /** Play text-to-speech for selected row */
  function playTTS() {
    const row = getSelectedRow();
    if (!row) return;
    const text = row.text;
    const lang = row.lang;

    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        window.speechSynthesis.speak(utterance);
        void feedback.showHUD('Playing audio…');
        return;
      }
    } catch {
      /* fallback to audio element */
    }

    try {
      const audioUrl = `https://translate.google.com/translate_tts?client=gtx&ie=UTF-8&tl=${lang}&q=${encodeURIComponent(text)}`;
      const audio = new Audio(audioUrl);
      void audio.play();
      void feedback.showHUD('Playing audio…');
    } catch {
      void feedback.showHUD('Audio playback unavailable');
    }
  }

  /** Open in Google Translate in browser */
  async function openGoogleTranslate() {
    const q = sourceText.trim() || (result?.translatedText ?? '');
    if (!q) return;
    const from = source === 'auto' ? (result?.detectedFrom ?? 'auto') : source;
    const url = `https://translate.google.com/?sl=${from}&tl=${target}&text=${encodeURIComponent(q)}&op=translate`;
    try {
      await interop.openUrl(url);
    } catch {
      window.open(url, '_blank');
    }
  }

  /** Cycle language sets forward or backward */
  async function cycleLanguageSet(direction: 1 | -1) {
    target = cycleTargetLanguage(target, direction, POPULAR_TARGETS);
    await storage.set(TARGET_KEY, target);
    updateAccessoryTitle();
    scheduleTranslate();
    const sLabel = source === 'auto' ? 'Auto-Detect' : labelOf(source);
    void feedback.showHUD(`Language Set: ${sLabel} → ${labelOf(target)}`);
  }

  /** Swap source and target languages */
  async function swap() {
    const from = source === 'auto' ? result?.detectedFrom : source;
    if (!from || from === target) return;
    source = target;
    target = from;
    await storage.set(TARGET_KEY, target);
    updateAccessoryTitle();
    scheduleTranslate();
    void feedback.showHUD(`Swapped: ${labelOf(source)} → ${labelOf(target)}`);
  }

  async function openHistory() {
    await interop.launchCommand(extensionId, 'history');
  }

  function handleKeydown(event: KeyboardEvent) {
    // Escape closes full text preview
    if (event.key === 'Escape' && fullTextOpen) {
      event.preventDefault();
      fullTextOpen = false;
      return;
    }

    // List navigation: ArrowDown / ArrowUp
    if (event.key === 'ArrowDown' && !event.metaKey && !event.altKey && !fullTextOpen) {
      if (rows.length > 0) {
        event.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, rows.length - 1);
        scrollSelectedIntoView();
      }
      return;
    }
    if (event.key === 'ArrowUp' && !event.metaKey && !event.altKey && !fullTextOpen) {
      if (rows.length > 0) {
        event.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        scrollSelectedIntoView();
      }
      return;
    }

    // Enter: Copy translation
    if (
      event.key === 'Enter' &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.shiftKey
    ) {
      if (rows.length > 0) {
        event.preventDefault();
        void copyTranslation();
      }
      return;
    }

    // ⌘⏎: Paste translation
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.altKey) {
      if (rows.length > 0) {
        event.preventDefault();
        void pasteTranslation();
      }
      return;
    }

    // ⌥⏎: Open in Google Translate
    if (event.key === 'Enter' && event.altKey) {
      event.preventDefault();
      void openGoogleTranslate();
      return;
    }

    // ⌘F: Toggle Full Text
    if ((event.key === 'f' || event.key === 'F') && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      toggleFullText();
      return;
    }

    // ⌘T: Play TTS
    if (
      (event.key === 't' || event.key === 'T') &&
      (event.metaKey || event.ctrlKey) &&
      !event.altKey
    ) {
      event.preventDefault();
      playTTS();
      return;
    }

    // ⌥⌘↑: Previous Language Set
    if (event.key === 'ArrowUp' && event.altKey && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void cycleLanguageSet(-1);
      return;
    }

    // ⌥⌘↓: Next Language Set
    if (event.key === 'ArrowDown' && event.altKey && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void cycleLanguageSet(1);
      return;
    }

    // ⌘S: Swap languages
    if ((event.key === 's' || event.key === 'S') && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void swap();
      return;
    }

    // ⌘H: Open history
    if ((event.key === 'h' || event.key === 'H') && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void openHistory();
      return;
    }
  }

  function scrollSelectedIntoView() {
    requestAnimationFrame(() => {
      const activeEl = listEl?.querySelector<HTMLElement>(
        `.gt-row[data-row-index="${selectedIndex}"]`,
      );
      activeEl?.scrollIntoView({ block: 'nearest' });
    });
  }

  // Update bottom bar action pill
  $effect(() => {
    if (rows.length === 0) {
      extensionManager?.setActiveViewActionLabel?.('Translate');
      return;
    }
    const row = rows[selectedIndex];
    if (row?.kind === 'pronunciation' || row?.kind === 'reverse-pronunciation') {
      extensionManager?.setActiveViewActionLabel?.('Copy Pronunciation');
    } else {
      extensionManager?.setActiveViewActionLabel?.('Copy Translation');
    }
  });

  onMount(async () => {
    window.addEventListener('message', handleHostMessage);
    window.addEventListener('keydown', handleKeydown);

    // Seed sticky target from storage
    const stored = await storage.get(TARGET_KEY);
    if (typeof stored === 'string' && isLanguageCode(stored)) {
      target = stored;
    }

    // Source language from preferences
    const prefs = context.preferences.values as Record<string, unknown>;
    const sPref = prefs?.sourceLang;
    if (typeof sPref === 'string' && (sPref === 'auto' || isLanguageCode(sPref))) {
      source = sPref;
    }

    // Pending query from worker search click
    const pending = await storage.get(PENDING_KEY);
    if (typeof pending === 'string' && pending) {
      sourceText = pending;
      await storage.delete(PENDING_KEY);
      scheduleTranslate();
    }

    // Initialize accessory with title matching Raycast: "Auto-Detect → Kurdish (Sorani)"
    updateAccessoryTitle();

    // Search bar accessory dropdown handler
    accessoryDispose = searchBarAccessory.onChange((value: string) => {
      if (isLanguageCode(value)) {
        target = value;
        void storage.set(TARGET_KEY, target);
        updateAccessoryTitle();
        scheduleTranslate();
      }
    });

    // Register all in-view actions in the host ActionService for ActionContext.EXTENSION_VIEW (⌘K panel)
    actions.registerAction({
      id: viewActionId(extensionId, 'copy-translation'),
      title: 'Copy Translation',
      icon: '📋',
      shortcut: 'Mod+Shift+C',
      primary: true,
      category: 'Translate',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      execute: () => copyTranslation(),
    });

    actions.registerAction({
      id: viewActionId(extensionId, 'paste-translation'),
      title: 'Paste Translation',
      icon: '📋',
      shortcut: 'Mod+Enter',
      category: 'Translate',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      execute: () => pasteTranslation(),
    });

    actions.registerAction({
      id: viewActionId(extensionId, 'toggle-full-text'),
      title: 'Toggle Full Text',
      icon: '🗖',
      shortcut: 'Mod+F',
      category: 'Translate',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      execute: () => toggleFullText(),
    });

    actions.registerAction({
      id: viewActionId(extensionId, 'play-tts'),
      title: 'Play Text-To-Speech',
      icon: '🔊',
      shortcut: 'Mod+T',
      category: 'Translate',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      execute: () => playTTS(),
    });

    actions.registerAction({
      id: viewActionId(extensionId, 'open-google-translate'),
      title: 'Open in Google Translate',
      icon: '🌐',
      shortcut: 'Alt+Enter',
      category: 'Translate',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      execute: () => openGoogleTranslate(),
    });

    actions.registerAction({
      id: viewActionId(extensionId, 'prev-lang-set'),
      title: 'Go to Previous Language Set',
      icon: '↑',
      category: 'Language Set',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      execute: () => cycleLanguageSet(-1),
    });

    actions.registerAction({
      id: viewActionId(extensionId, 'next-lang-set'),
      title: 'Go to Next Language Set',
      icon: '↓',
      category: 'Language Set',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      execute: () => cycleLanguageSet(1),
    });

    actions.registerAction({
      id: viewActionId(extensionId, 'swap'),
      title: 'Swap Languages',
      icon: '⇄',
      shortcut: 'Mod+Shift+S',
      category: 'Language Set',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      execute: () => swap(),
    });

    actions.registerAction({
      id: viewActionId(extensionId, 'open-history'),
      title: 'Open History',
      icon: '🕒',
      shortcut: 'Mod+H',
      category: 'History',
      extensionId,
      context: ActionContext.EXTENSION_VIEW,
      execute: () => openHistory(),
    });

    // Also register handlers for legacy act_${extensionId}_* IDs
    for (const name of VIEW_ACTION_NAMES) {
      const handler = () => {
        switch (name) {
          case 'copy-translation':
            return copyTranslation();
          case 'paste-translation':
            return pasteTranslation();
          case 'toggle-full-text':
            return toggleFullText();
          case 'play-tts':
            return playTTS();
          case 'open-google-translate':
            return openGoogleTranslate();
          case 'prev-lang-set':
            return cycleLanguageSet(-1);
          case 'next-lang-set':
            return cycleLanguageSet(1);
          case 'swap':
            return swap();
          case 'open-history':
            return openHistory();
        }
      };
      actions.registerActionHandler(viewActionId(extensionId, name), handler);
      actions.registerActionHandler(`act_${extensionId}_${name}`, handler);
    }
    actions.registerActionHandler(`act_${extensionId}_copy-pron`, copyTranslation);
  });

  onDestroy(() => {
    window.removeEventListener('message', handleHostMessage);
    window.removeEventListener('keydown', handleKeydown);
    accessoryDispose?.();
    if (debounceTimer) clearTimeout(debounceTimer);

    for (const name of VIEW_ACTION_NAMES) {
      actions.unregisterAction(viewActionId(extensionId, name));
    }
  });
</script>

<div class="gt-shell">
  {#if loading && rows.length === 0}
    <div class="gt-state">
      <span class="gt-spinner" aria-hidden="true"></span>
      <span>Translating…</span>
    </div>
  {:else if error && rows.length === 0}
    <div class="gt-state gt-state-error" role="alert">
      {error}
    </div>
  {:else if rows.length > 0}
    <ul class="gt-list custom-scrollbar" bind:this={listEl} aria-label="Translations">
      {#each rows as row, i (row.id)}
        <li class="gt-row" class:selected={selectedIndex === i} data-row-index={i}>
          <button
            class="gt-row-btn"
            onclick={() => {
              selectedIndex = i;
              void copyTranslation();
            }}
          >
            <span class="gt-row-text" dir={row.isRtl ? 'rtl' : 'auto'} lang={row.lang}>
              {row.text}
            </span>
            <span class="gt-row-tag">
              {row.tag}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <div class="gt-state gt-state-empty">
      <p class="gt-empty-title">Type above to translate</p>
      <span class="gt-empty-sub">⌥⌘↑ / ⌥⌘↓ to switch language set • ⌘K for actions</span>
    </div>
  {/if}

  {#if fullTextOpen && rows[selectedIndex]}
    {@const sel = rows[selectedIndex]}
    <div
      class="gt-scrim"
      role="presentation"
      onclick={() => (fullTextOpen = false)}
      onkeydown={(e) => e.key === 'Escape' && (fullTextOpen = false)}
    >
      <div
        class="gt-dialog"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
      >
        <div class="gt-dialog-header">
          <span class="gt-dialog-tag">{sel.tag}</span>
          <button class="gt-dialog-close" onclick={() => (fullTextOpen = false)}>✕</button>
        </div>
        <div class="gt-dialog-body" dir={sel.isRtl ? 'rtl' : 'auto'} lang={sel.lang}>
          {sel.text}
        </div>
        <div class="gt-dialog-actions">
          <button class="gt-btn secondary" onclick={() => playTTS()}>🔊 Play Audio</button>
          <button
            class="gt-btn primary"
            onclick={() => {
              void copyTranslation();
              fullTextOpen = false;
            }}>Copy Translation</button
          >
        </div>
      </div>
    </div>
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

  .gt-shell {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    font-family: var(--font-ui);
    color: var(--text-primary);
    user-select: none;
    box-sizing: border-box;
  }

  /* ── Translation list ─────────────────────────────────────────────────── */
  .gt-list {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: var(--space-1) var(--space-2);
    overflow-y: auto;
    list-style: none;
  }

  .gt-row {
    position: relative;
  }

  /* One 38px Raycast-styled row */
  .gt-row-btn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    height: var(--shell-row-h, 38px);
    margin: 0;
    padding: 0 var(--space-4);
    border: none;
    border-radius: var(--radius-md);
    background: none;
    color: inherit;
    font: inherit;
    cursor: default;
    box-sizing: border-box;
    transition: none;
  }

  .gt-row-btn:focus,
  .gt-row-btn:focus-visible {
    outline: none;
  }

  .gt-row:not(.selected) .gt-row-btn:hover {
    background: var(--bg-hover);
  }

  .gt-row.selected .gt-row-btn {
    background: var(--bg-selected);
  }

  .gt-row-text {
    flex: 1;
    min-width: 0;
    margin-right: var(--space-4);
    color: var(--text-primary);
    font-size: var(--font-size-md, 13px);
    font-weight: 500;
    line-height: 1.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: left;
  }

  .gt-row-text[dir='rtl'] {
    direction: rtl;
    unicode-bidi: plaintext;
    text-align: left;
  }

  .gt-row-tag {
    flex-shrink: 0;
    color: var(--text-tertiary);
    font-size: var(--font-size-sm, 12px);
    font-weight: 400;
    white-space: nowrap;
  }

  /* ── Empty, Loading, Error States ─────────────────────────────────────── */
  .gt-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    flex: 1;
    padding: var(--space-8);
    text-align: center;
    color: var(--text-tertiary);
  }

  .gt-empty-title {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--font-size-md);
    font-weight: 500;
  }

  .gt-empty-sub {
    font-size: var(--font-size-xs);
    color: var(--text-tertiary);
  }

  .gt-state-error {
    color: var(--accent-danger);
  }

  .gt-spinner {
    display: inline-block;
    width: 18px;
    height: 18px;
    border: 2px solid var(--border-color);
    border-top-color: var(--text-secondary);
    border-radius: 50%;
    animation: gt-spin 0.8s linear infinite;
  }

  @keyframes gt-spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* ── Full Text Dialog (⌘F) ────────────────────────────────────────────── */
  .gt-scrim {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-6);
    background: var(--scrim, rgba(0, 0, 0, 0.45));
    backdrop-filter: blur(8px);
    animation: gt-fade-in var(--dur-quick, 150ms) ease-out;
  }

  .gt-dialog {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    width: 100%;
    max-width: 440px;
    max-height: 80vh;
    padding: var(--space-6);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    background: var(--bg-popup);
    box-shadow: var(--shadow-popup);
    animation: gt-scale-in var(--dur-quick, 150ms) ease-out;
  }

  .gt-dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .gt-dialog-tag {
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    font-weight: 600;
  }

  .gt-dialog-close {
    border: none;
    background: none;
    color: var(--text-tertiary);
    font-size: var(--font-size-md);
    cursor: pointer;
    padding: var(--space-1);
    border-radius: var(--radius-xs);
  }

  .gt-dialog-close:hover {
    color: var(--text-primary);
  }

  .gt-dialog-body {
    max-height: 240px;
    overflow-y: auto;
    color: var(--text-primary);
    font-size: var(--font-size-xl, 18px);
    font-weight: 500;
    line-height: 1.5;
    user-select: text;
  }

  .gt-dialog-body[dir='rtl'] {
    direction: rtl;
    unicode-bidi: plaintext;
  }

  .gt-dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
    margin-top: var(--space-2);
  }

  .gt-btn {
    height: 28px;
    padding: 0 var(--space-4);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    font-family: inherit;
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition: var(--transition-fast);
  }

  .gt-btn.secondary {
    border-color: var(--border-color);
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .gt-btn.secondary:hover {
    background: var(--bg-hover);
  }

  .gt-btn.primary {
    background: var(--accent-primary, #3b82f6);
    color: var(--text-on-accent, #ffffff);
  }

  .gt-btn.primary:hover {
    background: color-mix(in srgb, var(--accent-primary, #3b82f6) 88%, #ffffff);
  }

  @keyframes gt-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes gt-scale-in {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .gt-scrim,
    .gt-dialog {
      animation: none;
    }
  }
</style>

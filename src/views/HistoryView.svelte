<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    ClipboardItemType,
    type IActionService,
    type IClipboardHistoryService,
    type IFeedbackService,
    type IStorageService,
    type IInteropService,
  } from 'asyar-sdk/contracts';
  import * as history from '../lib/history';
  import { labelOf } from '../lib/languages';
  import { timeAgo, truncate } from '../lib/format';

  interface Props {
    context: {
      preferences: { values: Record<string, unknown> };
    };
    actions: IActionService;
    clipboard: IClipboardHistoryService;
    feedback: IFeedbackService;
    storage: IStorageService;
    interop: IInteropService;
    extensionId: string;
  }
  let { context: _context, actions, clipboard, feedback, storage, interop, extensionId }: Props = $props();

  let entries  = $state<history.HistoryEntry[]>([]);
  let query    = $state('');
  let selected = $state<string | null>(null);

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      e.sourceText.toLowerCase().includes(q) ||
      e.translatedText.toLowerCase().includes(q));
  });

  const ACTION_RETRANSLATE = $derived(`act_${extensionId}_retranslate`);
  const ACTION_COPY        = $derived(`act_${extensionId}_copy-entry`);
  const ACTION_PIN         = $derived(`act_${extensionId}_pin-entry`);
  const ACTION_DELETE      = $derived(`act_${extensionId}_delete-entry`);
  const ACTION_CLEAR       = $derived(`act_${extensionId}_clear-all`);

  function clipboardTextItem(content: string) {
    return {
      id: `gt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: ClipboardItemType.Text,
      content,
      createdAt: Date.now(),
      favorite: false,
    };
  }

  function selectedEntry(): history.HistoryEntry | null {
    return selected ? entries.find((e) => e.id === selected) ?? null : null;
  }

  async function reload() {
    entries = await history.list(storage);
    const current = selectedEntry();
    if (current && !entries.find((e) => e.id === current.id)) selected = null;
    if (!selected && entries.length > 0) selected = entries[0].id;
  }

  function pickEntry(id: string) {
    selected = id;
  }

  function moveSelection(dir: 'up' | 'down') {
    if (filtered.length === 0) return;
    const current = selectedEntry();
    let idx = current ? filtered.findIndex((e) => e.id === current.id) : -1;
    if (dir === 'down') idx = (idx + 1) % filtered.length;
    else idx = (idx - 1 + filtered.length) % filtered.length;
    selected = filtered[idx]?.id ?? null;
  }

  function entryById(id: string | null): history.HistoryEntry | null {
    return id ? entries.find((e) => e.id === id) ?? null : null;
  }

  async function copyEntry() {
    const e = entryById(selected);
    if (!e) return;
    await clipboard.writeToClipboard(clipboardTextItem(e.translatedText));
    void feedback.showHUD('Copied to clipboard');
  }

  async function togglePin() {
    const e = entryById(selected);
    if (!e) return;
    await history.pin(storage, e.id, !e.pinned);
    await reload();
  }

  async function deleteEntry() {
    const e = entryById(selected);
    if (!e) return;
    await history.remove(storage, e.id);
    await reload();
  }

  async function clearAll() {
    const confirmed = await feedback.confirmAlert({
      title: 'Clear all history?',
      message: 'This will delete every saved translation and cannot be undone.',
      confirmText: 'Clear all',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!confirmed) return;
    await history.clearAll(storage);
    await reload();
  }

  async function retranslate() {
    const e = entryById(selected);
    if (!e) return;
    await storage.set('ui:pendingQuery', e.sourceText);
    await interop.launchCommand(extensionId, 'translate');
  }

  function handleHostMessage(event: MessageEvent) {
    if (event.source !== window.parent) return;
    if (event.data?.type === 'asyar:view:search') {
      query = event.data.payload?.query ?? '';
    }
  }

  function handleListKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection('up');
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection('down');
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const e = entryById(selected);
      if (e) void retranslate();
      return;
    }
  }

  onMount(async () => {
    window.addEventListener('message', handleHostMessage);
    await reload();

    actions.registerActionHandler(ACTION_RETRANSLATE, retranslate);
    actions.registerActionHandler(ACTION_COPY,        copyEntry);
    actions.registerActionHandler(ACTION_PIN,         togglePin);
    actions.registerActionHandler(ACTION_DELETE,      deleteEntry);
    actions.registerActionHandler(ACTION_CLEAR,       clearAll);
  });

  onDestroy(() => {
    window.removeEventListener('message', handleHostMessage);
  });
</script>

{#if filtered.length === 0}
  <div class="history__empty">
    {entries.length === 0 ? 'No translations yet.' : 'No matches.'}
  </div>
{:else}
  <ul class="history__list" role="listbox" aria-label="Translation history">
    {#each filtered as entry (entry.id)}
      <li
        class="history__row"
        class:history__row--selected={selected === entry.id}
        class:history__row--pinned={entry.pinned}
        role="option"
        tabindex="0"
        aria-selected={selected === entry.id}
        aria-label={entry.translatedText}
        onclick={() => pickEntry(entry.id)}
        onkeydown={handleListKeydown}
      >
        {#if entry.pinned}
          <span class="pin" aria-label="Pinned">📌</span>
        {/if}
        <span class="translated">{truncate(entry.translatedText, 60)}</span>
        <span class="when">{timeAgo(entry.at)}</span>
        <div class="history__bottom">
          <span class="source">{truncate(entry.sourceText, 50)}</span>
          <span class="sep">·</span>
          <span class="pair">{labelOf(entry.from)} → {labelOf(entry.to)}</span>
        </div>
      </li>
    {/each}
  </ul>
{/if}

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
  .history__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
  }
  .history__list::-webkit-scrollbar { width: 6px; }
  .history__list::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: var(--radius-full);
  }
  .history__row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    min-height: var(--shell-row-h, 38px);
    cursor: pointer;
    transition: background-color var(--transition-fast);
    border-radius: var(--radius-md);
  }
  .history__row:hover { background: var(--bg-hover); }
  .history__row--selected {
    background: var(--bg-selected);
    transition: none; /* instant snap, zero lag */
  }
  .history__row--pinned { position: relative; }
  .history__row:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: -2px;
    border-radius: var(--radius-md);
  }
  .history__row .pin {
    color: var(--accent-warning);
    font-size: var(--size-sm);
    line-height: 1;
    flex-shrink: 0;
  }
  .history__row .translated {
    color: var(--text-primary);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-medium);
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }
  .history__row .when {
    color: var(--text-tertiary);
    font-size: var(--font-size-2xs);
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
    white-space: nowrap;
  }
  .history__bottom {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    margin-top: var(--space-1);
    flex: 1;
  }
  .history__bottom .source {
    color: var(--text-secondary);
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }
  .history__bottom .sep { color: var(--text-tertiary); }
  .history__bottom .pair {
    color: var(--text-secondary);
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }
  .history__empty {
    padding: var(--space-9);
    color: var(--text-tertiary);
    text-align: center;
    font-size: var(--font-size-sm);
  }
</style>

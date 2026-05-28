<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    ClipboardItemType,
    type IActionService,
    type IClipboardHistoryService,
    type IStorageService,
    type IInteropService,
  } from 'asyar-sdk/contracts';
  import * as history from '../lib/history';
  import { labelOf } from '../lib/languages';
  import { timeAgo, truncate } from '../lib/format';

  interface Props {
    context: { preferences: { values: Record<string, unknown> } };
    actions: IActionService;
    clipboard: IClipboardHistoryService;
    storage: IStorageService;
    interop: IInteropService;
    extensionId: string;
  }
  let { context: _context, actions, clipboard, storage, interop, extensionId }: Props = $props();

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

  async function reload() {
    entries = await history.list(storage);
    if (selected && !entries.find((e) => e.id === selected)) selected = null;
    if (!selected && entries.length > 0) selected = entries[0].id;
  }

  function pickEntry(id: string) {
    selected = id;
  }

  function entryById(id: string | null): history.HistoryEntry | null {
    return id ? entries.find((e) => e.id === id) ?? null : null;
  }

  async function copyEntry() {
    const e = entryById(selected);
    if (!e) return;
    await clipboard.writeToClipboard(clipboardTextItem(e.translatedText));
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
    const confirmed = window.confirm(
      'Clear all translation history? This cannot be undone.',
    );
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
        role="option"
        tabindex="0"
        aria-selected={selected === entry.id}
        onclick={() => pickEntry(entry.id)}
        onkeydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            pickEntry(entry.id);
          }
        }}
      >
        <div class="history__top">
          {#if entry.pinned}<span class="pin">📌</span>{/if}
          <span class="translated">{truncate(entry.translatedText, 60)}</span>
        </div>
        <div class="history__bottom">
          <span class="source">{truncate(entry.sourceText, 50)}</span>
          <span class="sep">·</span>
          <span class="pair">{labelOf(entry.from)} → {labelOf(entry.to)}</span>
          <span class="sep">·</span>
          <span class="when">{timeAgo(entry.at)}</span>
        </div>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .history__list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .history__row {
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--separator);
    cursor: pointer;
  }
  .history__row:hover { background: var(--bg-hover); }
  .history__row--selected { background: var(--bg-selected); }
  .history__row:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: -2px;
  }
  .history__top {
    display: flex;
    gap: var(--space-2);
    align-items: baseline;
    color: var(--text-primary);
    font-size: var(--font-size-md);
  }
  .history__bottom {
    display: flex;
    gap: var(--space-2);
    align-items: baseline;
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
  }
  .history__bottom .sep { color: var(--text-tertiary); }
  .history__empty {
    padding: var(--space-6);
    color: var(--text-tertiary);
    text-align: center;
  }
  .pin { line-height: 1; }
</style>

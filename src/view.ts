import { mount } from 'svelte';
import {
  ExtensionContext,
  registerIconElement,
  searchBarAccessory,
} from 'asyar-sdk/view';
import type {
  INetworkService,
  IActionService,
  IClipboardHistoryService,
  IStorageService,
  ICacheService,
  IInteropService,
  ISelectionService,
} from 'asyar-sdk/contracts';
import TranslateView       from './views/TranslateView.svelte';
import HistoryView         from './views/HistoryView.svelte';
import SelectionResultView from './views/SelectionResultView.svelte';

const extensionId = resolveExtensionId();

const context = new ExtensionContext();
context.setExtensionId(extensionId);
registerIconElement();

// Forward ⌘K to the host so the action drawer opens.
window.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
    event.preventDefault();
    window.parent.postMessage({
      type: 'asyar:extension:keydown',
      payload: {
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
      },
    }, '*');
  }
});

window.parent.postMessage(
  { type: 'asyar:extension:loaded', extensionId, role: 'view' },
  '*',
);

// Resolve services once.
const network    = context.getService<INetworkService>('network');
const actions    = context.getService<IActionService>('actions');
const clipboard  = context.getService<IClipboardHistoryService>('clipboard');
const storage    = context.getService<IStorageService>('storage');
const cache      = context.getService<ICacheService>('cache');
const interop    = context.getService<IInteropService>('interop');
const selection  = context.getService<ISelectionService>('selection');

const viewName = new URLSearchParams(window.location.search).get('view') || 'TranslateView';
const target = document.getElementById('app')!;

if (viewName === 'TranslateView') {
  mount(TranslateView, {
    target,
    props: {
      context, network, actions, clipboard, storage, cache, interop,
      searchBarAccessory,
      extensionId,
    },
  });
} else if (viewName === 'HistoryView') {
  mount(HistoryView, {
    target,
    props: { context, actions, clipboard, storage, interop, extensionId },
  });
} else if (viewName === 'SelectionResultView') {
  mount(SelectionResultView, {
    target,
    props: {
      context, network, actions, clipboard, storage, cache, interop, selection,
      searchBarAccessory,
      extensionId,
    },
  });
}

function resolveExtensionId(): string {
  const fallback = 'org.asyar.google-translate';
  if (window.location.hostname === 'localhost' ||
      window.location.hostname === 'asyar-extension.localhost') {
    return window.location.pathname.split('/').filter(Boolean)[0] || fallback;
  }
  return window.location.hostname || fallback;
}

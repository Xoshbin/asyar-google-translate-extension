import { ExtensionContext as WorkerExtensionContext, extensionBridge } from 'asyar-sdk/worker';
import {
  type Extension,
  type ExtensionContext,
  type ExtensionResult,
  type INetworkService,
  type IFeedbackService,
  type IStorageService,
  type ICacheService,
  type IToolsService,
  type ManifestTool,
} from 'asyar-sdk/contracts';
import manifest from '../manifest.json';
import { translate, TranslateError, type TranslateResult } from './lib/translator';
import { getCached, setCached } from './lib/cache';
import * as history from './lib/history';
import { isLanguageCode, labelOf } from './lib/languages';
import { truncate } from './lib/format';

const extensionId = resolveExtensionId();
const ctx = new WorkerExtensionContext();
ctx.setExtensionId(extensionId);

// Service handles
const network = ctx.getService<INetworkService>('network');
const notif = ctx.getService<IFeedbackService>('feedback');
const storage = ctx.getService<IStorageService>('storage');
const cache = ctx.getService<ICacheService>('cache');
const tools = ctx.getService<IToolsService>('tools');

const TARGET_LANG_KEY = 'ui:targetLang';
const PENDING_QUERY_KEY = 'ui:pendingQuery';

// View → worker RPC: TranslateView / SelectionResultView fire this after a
// successful translate so history writes funnel through one place. Registered
// at module scope so the handler is live as soon as the worker iframe loads —
// extension.initialize() is only called if the extension explicitly invokes
// extensionBridge.initializeExtensions(), which we don't (and don't need to).
ctx.onRequest<history.AddInput, void>('translate-completed', async (payload, _signal) => {
  try {
    await writeHistoryIfEnabled(payload);
  } catch {
    // History is best-effort — never bubble the failure to the view.
  }
});

// Tool registration is async, but fire-and-forget at module scope. Same
// reason as above: no initialize() phase, so we do it here.
void registerTranslateTool();

class GoogleTranslateExt implements Extension {
  async initialize(_c: ExtensionContext): Promise<void> {}
  async activate(): Promise<void> {}
  async deactivate(): Promise<void> {}

  async executeCommand(_commandId: string, _args?: Record<string, unknown>): Promise<unknown> {
    // Both 'translate' and 'translate-selection' are mode:view commands —
    // the launcher navigates to their view component without dispatching
    // here. 'history' is also mode:view. So executeCommand has no work in
    // this worker. (Background-mode work would land here if we add any.)
    return undefined;
  }

  async search(query: string): Promise<ExtensionResult[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    const target = await getStickyTarget();
    return [
      {
        score: 0.35,
        title: `Translate "${truncate(q, 40)}" → ${labelOf(target)}`,
        subtitle: 'Open Google Translate',
        type: 'view',
        icon: '🌐',
        viewPath: `${extensionId}/TranslateView`,
        action: () => {
          // Host opens TranslateView; query is delivered via the storage mailbox
          // (TranslateView reads PENDING_QUERY_KEY on mount and clears it).
          void storage.set(PENDING_QUERY_KEY, q);
        },
      },
    ];
  }
}

const ext = new GoogleTranslateExt();
extensionBridge.registerManifest(
  manifest as unknown as Parameters<typeof extensionBridge.registerManifest>[0],
);
extensionBridge.registerExtensionImplementation(extensionId, ext);

// ─── helpers ────────────────────────────────────────────────────────────────

function resolveExtensionId(): string {
  return manifest.id;
}

async function getStickyTarget(): Promise<string> {
  const stored = await storage.get(TARGET_LANG_KEY);
  if (typeof stored === 'string' && isLanguageCode(stored)) return stored;
  const prefs = ctx.preferences.values as Record<string, unknown> | undefined;
  const pref = prefs?.targetLang;
  if (typeof pref === 'string' && isLanguageCode(pref)) return pref;
  return 'en';
}

async function getSourcePref(): Promise<string> {
  const prefs = ctx.preferences.values as Record<string, unknown> | undefined;
  const pref = prefs?.sourceLang;
  if (typeof pref === 'string' && (pref === 'auto' || isLanguageCode(pref))) {
    return pref;
  }
  return 'auto';
}

async function translateCached(from: string, to: string, text: string): Promise<TranslateResult> {
  const cached = await getCached(cache, from, to, text);
  if (cached) return cached;
  const result = await translate(network, { from, to, text });
  await setCached(cache, from, to, text, result);
  return result;
}

async function writeHistoryIfEnabled(input: history.AddInput): Promise<void> {
  const prefs = ctx.preferences.values as Record<string, unknown> | undefined;
  if (prefs?.historyEnabled === false) return;
  const limit = Number(prefs?.historyLimit ?? 200);
  await history.add(storage, input, isFinite(limit) && limit > 0 ? limit : 200);
}

async function registerTranslateTool(): Promise<void> {
  const tool = (manifest.tools as ManifestTool[] | undefined)?.find((t) => t.id === 'translate');
  if (!tool) return;
  await tools.registerTool(tool, async (args: unknown) => {
    const a = (args ?? {}) as { text?: unknown; to?: unknown; from?: unknown };
    const text = String(a.text ?? '');
    const to = String(a.to ?? '');
    const from = a.from === undefined || a.from === null ? 'auto' : String(a.from);
    if (!text || !to) {
      throw new Error('translate tool: text and to are required');
    }
    return translateCached(from, to, text);
  });
}

async function notifyError(err: unknown, preview: string): Promise<void> {
  const msg = err instanceof TranslateError ? err.message : 'Unexpected translation error';
  await notif.sendBackground({
    title: 'Translate failed',
    body: `${msg} — "${truncate(preview, 40)}"`,
  });
}

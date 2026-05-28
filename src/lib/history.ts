import type { IStorageService } from 'asyar-sdk/contracts';

export interface HistoryEntry {
  id: string;
  at: number;             // unix ms
  from: string;
  to: string;
  sourceText: string;
  translatedText: string;
  pronunciation?: string;
  pinned: boolean;
}

const PREFIX = 'history:';
const MAX = Number.MAX_SAFE_INTEGER;

let __seq = 0;
function nextSeq(): number {
  __seq = (__seq + 1) % 0xffffff;  // 24-bit space, wraps; resets per process load
  return __seq;
}

function newId(): string {
  // 8 hex chars of monotonic seq + 8 base36 random — total 16 chars, strictly increasing within a process.
  const seq = nextSeq().toString(16).padStart(8, '0');
  const rand = (Math.random().toString(36).slice(2) + '00000000').slice(0, 8);
  return seq + rand;
}

function revTs(): string {
  // (max - now) then (max24 - seq) — same `now` for two same-ms inserts still
  // produces strictly-ordered keys because seq is monotonic.
  const t = (MAX - Date.now()).toString(36).padStart(11, '0');
  const s = (0xffffff - __seq).toString(16).padStart(8, '0');
  return `${t}-${s}`;
}

function keyFor(entry: HistoryEntry, rev: string = revTs()): string {
  return `${PREFIX}${rev}:${entry.id}`;
}

export interface AddInput {
  from: string;
  to: string;
  sourceText: string;
  translatedText: string;
  pronunciation?: string;
}

export async function add(
  storage: IStorageService,
  input: AddInput,
  limit: number = Infinity,
): Promise<HistoryEntry> {
  // newId() bumps __seq; revTs() reads it. Order matters and must stay paired.
  const id = newId();
  const rev = revTs();
  const entry: HistoryEntry = {
    id,
    at: Date.now(),
    from: input.from,
    to: input.to,
    sourceText: input.sourceText,
    translatedText: input.translatedText,
    pronunciation: input.pronunciation,
    pinned: false,
  };
  await storage.set(`${PREFIX}${rev}:${id}`, JSON.stringify(entry));
  await evict(storage, limit);
  return entry;
}

export async function list(
  storage: IStorageService,
): Promise<HistoryEntry[]> {
  const all = await storage.getAll();
  // Sort keys alphabetically; history:<rev-ts>:<id> sorts newest-first
  // because rev-ts = MAX_SAFE_INTEGER - Date.now() (smaller = newer).
  const pairs: Array<{ key: string; entry: HistoryEntry }> = [];
  for (const [k, v] of Object.entries(all)) {
    if (!k.startsWith(PREFIX)) continue;
    try {
      pairs.push({ key: k, entry: JSON.parse(v as string) as HistoryEntry });
    } catch { /* skip corrupt */ }
  }
  pairs.sort((a, b) => {
    const aPinned = a.entry.pinned;
    const bPinned = b.entry.pinned;
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    // Alphabetical key sort: smaller key = newer (rev-ts trick).
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  return pairs.map(p => p.entry);
}

export async function pin(
  storage: IStorageService,
  id: string,
  pinned: boolean,
): Promise<void> {
  const all = await storage.getAll();
  for (const [k, v] of Object.entries(all)) {
    if (!k.startsWith(PREFIX)) continue;
    let entry: HistoryEntry;
    try { entry = JSON.parse(v as string) as HistoryEntry; }
    catch { continue; }
    if (entry.id !== id) continue;
    entry.pinned = pinned;
    await storage.delete(k);
    await storage.set(keyFor(entry), JSON.stringify(entry));
    return;
  }
}

export async function remove(
  storage: IStorageService,
  id: string,
): Promise<void> {
  const all = await storage.getAll();
  for (const k of Object.keys(all)) {
    if (!k.startsWith(PREFIX)) continue;
    if (k.endsWith(':' + id)) {
      await storage.delete(k);
      return;
    }
  }
}

export async function clearAll(storage: IStorageService): Promise<void> {
  const all = await storage.getAll();
  for (const k of Object.keys(all)) {
    if (k.startsWith(PREFIX)) await storage.delete(k);
  }
}

async function evict(
  storage: IStorageService,
  limit: number,
): Promise<void> {
  if (!isFinite(limit) || limit <= 0) return;
  const entries = await list(storage);
  const nonPinned = entries.filter((e) => !e.pinned);
  const nonPinnedLimit = Math.max(0, limit - entries.filter(e => e.pinned).length);
  if (nonPinned.length <= nonPinnedLimit) return;
  // Remove oldest non-pinned first; list() ordering means oldest is at the end.
  const toRemove = nonPinned.slice(nonPinnedLimit);
  for (const e of toRemove) await remove(storage, e.id);
}

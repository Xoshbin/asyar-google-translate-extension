import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  add, list, pin, remove, clearAll,
  type HistoryEntry,
} from './history';

interface FakeStorage {
  data: Map<string, string>;
}
function makeStorage(): { storage: FakeStorage; service: any } {
  const data = new Map<string, string>();
  const service = {
    get: vi.fn(async (k: string) => data.get(k)),
    set: vi.fn(async (k: string, v: string) => { data.set(k, v); }),
    delete: vi.fn(async (k: string) => data.delete(k)),
    getAll: vi.fn(async () => Object.fromEntries(data.entries())),
    clear: vi.fn(async () => { data.clear(); }),
  };
  return { storage: { data }, service };
}

describe('history', () => {
  let storage: FakeStorage;
  let service: any;
  beforeEach(() => { ({ storage, service } = makeStorage()); });

  it('add() writes a history:<rev-ts>:<id> key', async () => {
    const entry = await add(service, {
      from: 'en', to: 'es',
      sourceText: 'hello', translatedText: 'hola',
    });
    expect(entry.id).toMatch(/^[0-9a-z]{16,}$/);
    const keys = [...storage.data.keys()];
    expect(keys.some((k) => k.startsWith('history:'))).toBe(true);
  });

  it('list() returns entries newest-first', async () => {
    const a = await add(service, { from: 'en', to: 'es', sourceText: 'one',   translatedText: 'uno' });
    await new Promise(r => setTimeout(r, 2));
    const b = await add(service, { from: 'en', to: 'es', sourceText: 'two',   translatedText: 'dos' });
    await new Promise(r => setTimeout(r, 2));
    const c = await add(service, { from: 'en', to: 'es', sourceText: 'three', translatedText: 'tres' });
    const all = await list(service);
    expect(all.map(e => e.id)).toEqual([c.id, b.id, a.id]);
  });

  it('pin() flips the pinned flag and moves entry to the top', async () => {
    const a = await add(service, { from: 'en', to: 'es', sourceText: 'a', translatedText: 'A' });
    const b = await add(service, { from: 'en', to: 'es', sourceText: 'b', translatedText: 'B' });
    await pin(service, a.id, true);
    const all = await list(service);
    expect(all[0].id).toBe(a.id);
    expect(all[0].pinned).toBe(true);
    expect(all[1].id).toBe(b.id);
  });

  it('eviction respects historyLimit, preserves pinned entries', async () => {
    const limit = 3;
    const a = await add(service, { from: 'en', to: 'es', sourceText: 'a', translatedText: 'A' }, limit);
    await pin(service, a.id, true);
    await add(service, { from: 'en', to: 'es', sourceText: 'b', translatedText: 'B' }, limit);
    await add(service, { from: 'en', to: 'es', sourceText: 'c', translatedText: 'C' }, limit);
    await add(service, { from: 'en', to: 'es', sourceText: 'd', translatedText: 'D' }, limit);
    await add(service, { from: 'en', to: 'es', sourceText: 'e', translatedText: 'E' }, limit);
    const all = await list(service);
    // Pinned 'a' is preserved; oldest non-pinned is evicted.
    const sources = all.map(e => e.sourceText);
    expect(sources).toContain('a');
    expect(sources).not.toContain('b');
  });

  it('remove() deletes by id', async () => {
    const a = await add(service, { from: 'en', to: 'es', sourceText: 'a', translatedText: 'A' });
    await remove(service, a.id);
    const all = await list(service);
    expect(all.find(e => e.id === a.id)).toBeUndefined();
  });

  it('clearAll() deletes everything', async () => {
    await add(service, { from: 'en', to: 'es', sourceText: 'a', translatedText: 'A' });
    await add(service, { from: 'en', to: 'es', sourceText: 'b', translatedText: 'B' });
    await clearAll(service);
    const all = await list(service);
    expect(all).toEqual([]);
  });
});

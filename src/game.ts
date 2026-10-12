export type Category = { id: string; label: string; description: string };
export type Opportunity = {
  id: string; title: string; provider: string; category: string;
  description: string; value: string; eligibility: string;
  status: string; officialUrl: string; reviewDate: string | null;
};
export type Catalog = {
  schemaVersion: number; sourceRepository: string; sourceCommit: string;
  generatedAt: string; categories: Category[]; opportunities: Opportunity[];
};
export type HistoryItem = { id: string; at: string };
export type SavedState = { version: 1; seen: string[]; history: HistoryItem[]; includeUnconfirmed: boolean };

export const emptyState = (): SavedState => ({ version: 1, seen: [], history: [], includeUnconfirmed: false });

export function normalizeState(input: unknown): SavedState {
  if (!input || typeof input !== 'object') return emptyState();
  const x = input as Partial<SavedState>;
  if (x.version !== 1) return emptyState();
  const seen = Array.isArray(x.seen) ? [...new Set(x.seen.filter((id): id is string => typeof id === 'string' && /^[a-z0-9-]{3,90}$/.test(id)))].slice(-20000) : [];
  const history = Array.isArray(x.history) ? x.history.filter((h): h is HistoryItem => h && typeof h.id === 'string' && typeof h.at === 'string' && seen.includes(h.id)).slice(-80) : [];
  return { version: 1, seen, history, includeUnconfirmed: x.includeUnconfirmed === true };
}

export function pool(catalog: Catalog, state: SavedState): Opportunity[] {
  const excluded = new Set(state.seen);
  return catalog.opportunities.filter(o => !excluded.has(o.id) && (state.includeUnconfirmed || o.status !== 'unconfirmed'));
}
export function availableCategories(catalog: Catalog, remaining: Opportunity[]): Category[] {
  const ids = new Set(remaining.map(o => o.category));
  return catalog.categories.filter(c => ids.has(c.id));
}

/** Uniform random index, with rejection sampling to avoid modulo bias. */
export function secureIndex(max: number): number {
  if (!Number.isSafeInteger(max) || max < 1 || max > 0x100000000) throw new Error('Invalid random range');
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return buf[0] % max;
}

/** Pick a winner from the entire pool, then build its visual shortlist. */
export function draw<T>(items: readonly T[], slots = 8, randomIndex: (n: number) => number = secureIndex): { winner: T; preview: T[]; winnerIndex: number } {
  if (!items.length) throw new Error('No choices left');
  const winner = items[randomIndex(items.length)];
  const others = items.filter((_, index) => items[index] !== winner);
  const previewSize = Math.min(slots, items.length);
  const preview: T[] = [];
  for (let i = 0; i < previewSize - 1; i++) {
    const choice = randomIndex(others.length);
    preview.push(others[choice]);
    others[choice] = others[others.length - 1];
    others.pop();
  }
  const winnerIndex = randomIndex(previewSize);
  preview.splice(winnerIndex, 0, winner);
  return { winner, preview, winnerIndex };
}

export function recordWin(state: SavedState, id: string, at = new Date().toISOString()): SavedState {
  if (state.seen.includes(id)) return state;
  return { ...state, seen: [...state.seen, id], history: [{ id, at }, ...state.history].slice(0, 80) };
}

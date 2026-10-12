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

export const emptyState = (): SavedState => ({ version: 1, seen: [], history: [], includeUnconfirmed: true });

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
/** A category must have at least eight options in the current filtered pool.
 * A category already chosen can still be played down to its last option. */
export const MIN_CATEGORY_OPTIONS = 8;
export function availableCategories(catalog: Catalog, remaining: Opportunity[], minimum = MIN_CATEGORY_OPTIONS): Category[] {
  const counts = new Map<string, number>();
  for (const item of remaining) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  return catalog.categories.filter(c => (counts.get(c.id) ?? 0) >= minimum);
}

/** Uniform random index, with rejection sampling to avoid modulo bias. */
export function secureIndex(max: number): number {
  if (!Number.isSafeInteger(max) || max < 1 || max > 0x100000000) throw new Error('Invalid random range');
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return buf[0] % max;
}

/** All wheel slices are real options: the secure draw returns their exact index. */
export function draw<T>(items: readonly T[], randomIndex: (n: number) => number = secureIndex): { winner: T; winnerIndex: number } {
  if (!items.length) throw new Error('No choices left');
  const winnerIndex = randomIndex(items.length);
  return { winner: items[winnerIndex], winnerIndex };
}

export function recordWin(state: SavedState, id: string, at = new Date().toISOString()): SavedState {
  if (state.seen.includes(id)) return state;
  return { ...state, seen: [...state.seen, id], history: [{ id, at }, ...state.history].slice(0, 80) };
}

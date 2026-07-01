/**
 * In-process hit/miss counters for DragonflyDB caches (Task #2517).
 * Exposed via /api/admin/matching/perf.
 */

type Counter = { hits: number; misses: number; errors: number };

const counters = new Map<string, Counter>();

function get(ns: string): Counter {
  let c = counters.get(ns);
  if (!c) {
    c = { hits: 0, misses: 0, errors: 0 };
    counters.set(ns, c);
  }
  return c;
}

export function recordHit(ns: string): void {
  get(ns).hits++;
}

export function recordMiss(ns: string): void {
  get(ns).misses++;
}

export function recordError(ns: string): void {
  get(ns).errors++;
}

export function snapshotCacheMetrics() {
  const out: Record<string, Counter & { hitRate: number | null }> = {};
  for (const [ns, c] of counters.entries()) {
    const total = c.hits + c.misses;
    out[ns] = { ...c, hitRate: total > 0 ? c.hits / total : null };
  }
  return out;
}

export function resetCacheMetrics(): void {
  counters.clear();
}

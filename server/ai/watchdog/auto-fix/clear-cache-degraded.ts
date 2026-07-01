// Task #2533 — Auto-fix: se DragonflyDB irraggiungibile o latenza p99 alta E cache
// LRU in-process esiste, evita stale invalidando le entries più vecchie.
// Best-effort: cerca registry globale __bikerlinkLruCaches.
import type { AutoFixRule } from "../types";

interface LruLike { reset?: () => void; clear?: () => void; size?: number }

export const clearCacheDegraded: AutoFixRule = {
  id: "clear_cache_degraded",
  description: "Reset cache LRU in-process se p99 latency >5s o DragonflyDB down",
  async run(snap) {
    const p99 = snap.metrics["latency.latency.p99_ms"] ?? 0;
    const dragonflyDown = snap.problems.some((p) => p.id === "dragonfly.dragonfly.unreachable");
    if (p99 < 5000 && !dragonflyDown) return { applied: false, reason: "no trigger" };

    const reg = (globalThis as unknown as { __bikerlinkLruCaches?: Map<string, LruLike> }).__bikerlinkLruCaches;
    if (!reg || reg.size === 0) return { applied: false, reason: "nessuna LRU registrata" };
    let cleared = 0;
    for (const [, cache] of reg.entries()) {
      try {
        if (typeof cache.clear === "function") { cache.clear(); cleared++; }
        else if (typeof cache.reset === "function") { cache.reset(); cleared++; }
      } catch { /* ignore */ }
    }
    if (cleared === 0) return { applied: false, reason: "nessuna LRU clearable" };
    return {
      applied: true,
      summary: `Reset ${cleared} cache LRU in-process (p99=${p99}ms, dragonflyDown=${dragonflyDown})`,
      details: { cleared, p99, dragonflyDown },
    };
  },
};

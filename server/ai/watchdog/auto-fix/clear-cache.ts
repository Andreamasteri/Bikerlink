// Task #891 — Dispatch rule per actionKind "clear_cache": stessa logica di
// clear_cache_degraded (reset LRU caches in globalThis.__bikerlinkLruCaches) ma
// SENZA il gate sui trigger metrici — l'admin ha già deciso accettando la proposta.
import type { AutoFixRule } from "../types";

interface LruLike { reset?: () => void; clear?: () => void; size?: number }

export const clearCacheRule: AutoFixRule = {
  id: "clear_cache",
  description: "Reset di tutte le cache LRU in-process (accept esplicito admin)",
  async run(_snap) {
    const reg = (globalThis as unknown as { __bikerlinkLruCaches?: Map<string, LruLike> }).__bikerlinkLruCaches;
    if (!reg || reg.size === 0) return { applied: false, reason: "nessuna cache LRU registrata" };
    let cleared = 0;
    for (const [, cache] of reg.entries()) {
      try {
        if (typeof cache.clear === "function") { cache.clear(); cleared++; }
        else if (typeof cache.reset === "function") { cache.reset(); cleared++; }
      } catch { /* ignore */ }
    }
    if (cleared === 0) return { applied: false, reason: "nessuna cache LRU clearable" };
    return {
      applied: true,
      summary: `Reset ${cleared} cache LRU in-process`,
      details: { cleared },
    };
  },
};

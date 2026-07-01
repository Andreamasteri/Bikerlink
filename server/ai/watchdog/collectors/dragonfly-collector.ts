// Collector DragonflyDB. Se non configurato, restituisce signal "absent" senza severità.
// Hysteresis: warn di default, high solo dopo 3 fallimenti consecutivi senza recovery.
// Naming interno (source "dragonfly", metric "dragonfly.*") — cablato in
// SignalSource/aggregator/auto-fix, vedi server/ai/watchdog/types.ts.
import type { Signal } from "../types";

let warned = false;

// Contatore fallimenti consecutivi — resettato a ogni ping riuscito.
let consecutiveFailures = 0;
const FAILURES_BEFORE_HIGH = 3;

// True dopo il primo ping riuscito in questa sessione.
// L'escalation a "high" richiede che DragonflyDB fosse stato raggiungibile in precedenza.
// Se mai connesso in questa sessione → severity "info" (fallback in-memory attivo fin dal boot, nessuna regressione).
let hadSuccessfulConnection = false;

export async function collectDragonfly(): Promise<Signal[]> {
  const signals: Signal[] = [];
  const url = process.env.TC_DRAGONFLY_URL ?? process.env.TC_REDIS_URL;
  if (!url) {
    signals.push({
      source: "dragonfly", metric: "dragonfly.absent", severity: "info",
      details: { reason: "TC_DRAGONFLY_URL non impostato" },
    });
    return signals;
  }
  try {
    const ioredis = await import("ioredis").catch(() => null);
    if (!ioredis) {
      if (!warned) { console.warn("[watchdog/dragonfly] ioredis non installato"); warned = true; }
      return signals;
    }
    const Dragonfly = (ioredis as { default?: unknown }).default ?? ioredis;
    const DragonflyCtor = Dragonfly as unknown as { new (url: string, opts?: unknown): { ping: () => Promise<string>; info: (s?: string) => Promise<string>; quit: () => Promise<unknown> } };
    const client = new DragonflyCtor(url, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 1500 });
    const started = Date.now();
    await client.ping();
    const pingMs = Date.now() - started;
    // Ping riuscito: segna connessione avvenuta e azzera contatore fallimenti.
    hadSuccessfulConnection = true;
    consecutiveFailures = 0;
    signals.push({
      source: "dragonfly", metric: "dragonfly.ping_ms", value: pingMs, unit: "ms",
      severity: pingMs > 200 ? "warn" : "info",
    });
    try {
      // DragonflyDB's INFO memory section may omit or rename some fields
      // (e.g. used_memory_rss, rdb_changes_since_last_save) — only `used_memory`
      // is relied upon here, with optional-chaining-style guards so a missing
      // or unparsable field degrades to "no signal" instead of throwing.
      const info = await client.info("memory");
      const m = /used_memory:(\d+)/.exec(info ?? "");
      const usedMemoryBytes = m?.[1] ? Number(m[1]) : null;
      if (usedMemoryBytes != null && Number.isFinite(usedMemoryBytes)) {
        const mb = Math.round(usedMemoryBytes / 1024 / 1024);
        signals.push({
          source: "dragonfly", metric: "dragonfly.used_memory_mb", value: mb, unit: "MB",
          severity: mb > 800 ? "warn" : "info",
        });
      }
    } catch { /* ignore — campo assente o non parsabile, nessun segnale emesso */ }
    await client.quit().catch(() => {});
  } catch (err) {
    consecutiveFailures += 1;
    // mai connesso = fallback in-memory attivo fin dal boot = info (nessuna regressione).
    // era connesso e ha smesso = warn; dopo N fallimenti consecutivi scala a high.
    const severity = !hadSuccessfulConnection
      ? "info"
      : consecutiveFailures >= FAILURES_BEFORE_HIGH ? "high" : "warn";
    signals.push({
      source: "dragonfly", metric: "dragonfly.unreachable", severity,
      details: {
        error: (err as Error).message,
        consecutiveFailures,
        fallback: "in-memory",
      },
    });
  }
  return signals;
}

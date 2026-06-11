// Task #2533 — Collector Redis. Se non configurato, restituisce signal "absent" senza severità.
// Task #3799 — Hysteresis: warn di default, high solo dopo 3 fallimenti consecutivi senza recovery.
import type { Signal } from "../types";

let warned = false;

// Contatore fallimenti consecutivi — resettato a ogni ping riuscito.
let consecutiveFailures = 0;
const FAILURES_BEFORE_HIGH = 3;

// True dopo il primo ping riuscito in questa sessione.
// L'escalation a "high" richiede che Redis fosse stato raggiungibile in precedenza:
// un Redis mai configurato/raggiungibile resta sempre "warn" (fallback in-memory).
let hadSuccessfulConnection = false;

export async function collectRedis(): Promise<Signal[]> {
  const signals: Signal[] = [];
  const url = process.env.REDIS_URL ?? process.env.REDIS_URI;
  if (!url) {
    signals.push({
      source: "redis", metric: "redis.absent", severity: "info",
      details: { reason: "REDIS_URL non impostato" },
    });
    return signals;
  }
  try {
    const ioredis = await import("ioredis").catch(() => null);
    if (!ioredis) {
      if (!warned) { console.warn("[watchdog/redis] ioredis non installato"); warned = true; }
      return signals;
    }
    const Redis = (ioredis as { default?: unknown }).default ?? ioredis;
    const RedisCtor = Redis as unknown as { new (url: string, opts?: unknown): { ping: () => Promise<string>; info: (s?: string) => Promise<string>; quit: () => Promise<unknown> } };
    const client = new RedisCtor(url, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 1500 });
    const started = Date.now();
    await client.ping();
    const pingMs = Date.now() - started;
    // Ping riuscito: segna connessione avvenuta e azzera contatore fallimenti.
    hadSuccessfulConnection = true;
    consecutiveFailures = 0;
    signals.push({
      source: "redis", metric: "redis.ping_ms", value: pingMs, unit: "ms",
      severity: pingMs > 200 ? "warn" : "info",
    });
    try {
      const info = await client.info("memory");
      const m = /used_memory:(\d+)/.exec(info);
      if (m) {
        const mb = Math.round(Number(m[1]) / 1024 / 1024);
        signals.push({
          source: "redis", metric: "redis.used_memory_mb", value: mb, unit: "MB",
          severity: mb > 800 ? "warn" : "info",
        });
      }
    } catch { /* ignore */ }
    await client.quit().catch(() => {});
  } catch (err) {
    consecutiveFailures += 1;
    // Scala a high solo se Redis era raggiungibile in precedenza (hadSuccessfulConnection)
    // e sono accumulati N fallimenti consecutivi. Un Redis mai disponibile in questa
    // sessione resta sempre warn: il fallback in-memory è già attivo e non c'è regressione.
    const severity = (hadSuccessfulConnection && consecutiveFailures >= FAILURES_BEFORE_HIGH) ? "high" : "warn";
    signals.push({
      source: "redis", metric: "redis.unreachable", severity,
      details: {
        error: (err as Error).message,
        consecutiveFailures,
        fallback: "in-memory",
      },
    });
  }
  return signals;
}

// Task #2533 — Collector Redis. Se non configurato, restituisce signal "absent" senza severità.
import type { Signal } from "../types";

let warned = false;

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
    signals.push({
      source: "redis", metric: "redis.unreachable", severity: "high",
      details: { error: (err as Error).message },
    });
  }
  return signals;
}

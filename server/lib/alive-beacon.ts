// Alive Beacon — tre funzioni:
//   1. logAlive()        — log ogni 60s con metriche chiave nel workflow console
//   2. pingKumaPush()    — GET su UPTIME_KUMA_PUSH_URL ogni 60s (se configurato)
//   3. getServerStats()  — snapshot istantaneo (usato da /api/beacon)

import { getPoolStats } from "../db";
import { getBgDbLimiterStats } from "./bg-db-limiter";

const BEACON_INTERVAL_MS = 60_000;

export interface ServerStats {
  uptime_s: number;
  memory_rss_mb: number;
  memory_heap_used_mb: number;
  memory_heap_total_mb: number;
  pool: ReturnType<typeof getPoolStats>;
  bg: ReturnType<typeof getBgDbLimiterStats>;
}

export function getServerStats(): ServerStats {
  const mem = process.memoryUsage();
  return {
    uptime_s: Math.floor(process.uptime()),
    memory_rss_mb: Math.round(mem.rss / 1024 / 1024),
    memory_heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
    memory_heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
    pool: getPoolStats(),
    bg: getBgDbLimiterStats(),
  };
}

async function pingKumaPush(): Promise<void> {
  const raw = process.env.UPTIME_KUMA_PUSH_URL?.trim();
  if (!raw) return;
  try {
    const url = new URL(raw);
    url.searchParams.set("status", "up");
    url.searchParams.set("msg", "OK");
    url.searchParams.set("ping", String(Math.floor(process.uptime() * 1000)));
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      console.warn(`[BEACON] Uptime Kuma push ← HTTP ${res.status} (${url.hostname})`);
    }
  } catch (err) {
    console.warn(`[BEACON] Uptime Kuma push failed: ${(err as Error).message}`);
  }
}

function logAlive(): void {
  const s = getServerStats();
  const active = s.pool.total - s.pool.idle;
  console.log(
    `[BEACON] ▶ uptime=${s.uptime_s}s  rss=${s.memory_rss_mb}MB  heap=${s.memory_heap_used_mb}/${s.memory_heap_total_mb}MB` +
    `  db=${active}/${s.pool.max} conn  bg=${s.bg.active}/${s.bg.max} slot queued=${s.bg.queued}` +
    (s.bg.dbSlowPingsConsecutive > 0 ? `  slowPings=${s.bg.dbSlowPingsConsecutive}⚠️` : ""),
  );
}

/** Avvia il beacon: primo tick immediato, poi ogni 60s. */
export function startAliveBeacon(): void {
  logAlive();
  pingKumaPush().catch(() => undefined);

  const timer = setInterval(() => {
    logAlive();
    pingKumaPush().catch(() => undefined);
  }, BEACON_INTERVAL_MS);

  timer.unref?.();
  console.log(`[BEACON] Avviato — log ogni ${BEACON_INTERVAL_MS / 1000}s${process.env.UPTIME_KUMA_PUSH_URL ? " + Uptime Kuma push attivo" : ""}`);
}

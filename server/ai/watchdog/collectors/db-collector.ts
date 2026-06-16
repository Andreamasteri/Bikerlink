// Task #2533 — Collector DB Postgres. Connessioni, query lente, dimensione, IOPS approssimate.
import { db } from "../../../db";
import { sql } from "drizzle-orm";
import type { Signal } from "../types";
import { recordSuccess as cbRecordSuccess, recordFailure as cbRecordFailure, getCircuitStatus } from "../../../db-circuit-breaker";

export async function collectDb(): Promise<Signal[]> {
  const signals: Signal[] = [];
  const started = Date.now();
  try {
    // Ping
    await db.execute(sql`SELECT 1`);
    const pingMs = Date.now() - started;
    cbRecordSuccess();
    if (pingMs > 5000) {
      try {
        const poolMod = await import("../../../db").catch(() => null);
        const poolInfo = poolMod ? (poolMod.pool as { totalCount?: number; idleCount?: number; waitingCount?: number }) : null;
        console.warn(
          `[watchdog/db] ping spike: ${pingMs}ms` +
          (poolInfo ? ` — pool: total=${poolInfo.totalCount ?? "?"} idle=${poolInfo.idleCount ?? "?"} waiting=${poolInfo.waitingCount ?? "?"}` : ""),
        );
      } catch { /* best-effort */ }
    }
    signals.push({
      source: "db", metric: "db.ping_ms", value: pingMs, unit: "ms",
      severity: pingMs > 500 ? "high" : pingMs > 150 ? "warn" : "info",
    });

    // Connessioni attive
    try {
      const r = await db.execute<{ active: number; total: number }>(sql`
        SELECT
          COUNT(*) FILTER (WHERE state = 'active')::int AS active,
          COUNT(*)::int AS total
        FROM pg_stat_activity
        WHERE datname = current_database()
      `);
      const row = (r as { rows?: Array<{ active: number; total: number }> }).rows?.[0];
      if (row) {
        signals.push({
          source: "db", metric: "db.connections.active", value: Number(row.active), unit: "conn",
          severity: row.active > 80 ? "high" : row.active > 40 ? "warn" : "info",
          details: { total: Number(row.total) },
        });
      }
    } catch { /* permission denied su pg_stat_activity → silenzio */ }

    // Query lente: pg_stat_statements (se installato)
    try {
      const r = await db.execute<{ slow_count: number }>(sql`
        SELECT COUNT(*)::int AS slow_count
        FROM pg_stat_statements
        WHERE mean_exec_time > 500
      `);
      const row = (r as { rows?: Array<{ slow_count: number }> }).rows?.[0];
      if (row) {
        signals.push({
          source: "db", metric: "db.slow_queries", value: Number(row.slow_count), unit: "queries",
          severity: row.slow_count > 50 ? "high" : row.slow_count > 10 ? "warn" : "info",
        });
      }
    } catch { /* extension non installata */ }

    // Size DB (informativo)
    try {
      const r = await db.execute<{ size_mb: number }>(sql`
        SELECT (pg_database_size(current_database()) / 1024.0 / 1024.0)::float AS size_mb
      `);
      const row = (r as { rows?: Array<{ size_mb: number }> }).rows?.[0];
      if (row) {
        signals.push({
          source: "db", metric: "db.size_mb", value: Number(row.size_mb), unit: "MB", severity: "info",
        });
      }
    } catch { /* ignore */ }
  } catch (err) {
    cbRecordFailure(err);
    signals.push({
      source: "db", metric: "collector.error", severity: "critical",
      details: { error: (err as Error).message },
    });
  }

  // Circuit breaker state — always emitted so it appears in watchdog metrics
  const circuit = getCircuitStatus();
  if (circuit.state !== "CLOSED") {
    signals.push({
      source: "db",
      metric: "db.circuit_breaker",
      severity: circuit.state === "OPEN" ? "critical" : "warn",
      value: circuit.consecutiveFailures,
      details: { state: circuit.state, openedAt: circuit.openedAt },
    });
  } else {
    signals.push({
      source: "db",
      metric: "db.circuit_breaker",
      severity: "info",
      value: 0,
      details: { state: "CLOSED" },
    });
  }

  return signals;
}

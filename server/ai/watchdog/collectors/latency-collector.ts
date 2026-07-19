// Task #2533 — Collector latenza API. Espone middleware e leggere statistiche.
// Mantiene una rolling window degli ultimi N ms-per-richiesta in-memory.
import type { Request, Response, NextFunction } from "express";
import type { Signal } from "../types";
import { getBgDbLimiterStats } from "../../../lib/bg-db-limiter";

const WINDOW = 500;
const samples: number[] = [];

export function latencyMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Solo per /api/*; salta health/static
  if (!req.path.startsWith("/api")) return next();
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    try {
      const ns = Number(process.hrtime.bigint() - start);
      const ms = ns / 1_000_000;
      samples.push(ms);
      if (samples.length > WINDOW) samples.shift();
    } catch { /* ignore */ }
  });
  next();
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export async function collectLatency(): Promise<Signal[]> {
  if (samples.length === 0) {
    return [{ source: "latency", metric: "latency.samples", value: 0, severity: "info" }];
  }
  const p50 = Math.round(percentile(samples, 50));
  const p95 = Math.round(percentile(samples, 95));
  const p99 = Math.round(percentile(samples, 99));

  // Quando il DB è già confermato lento (kill-switch attivo a ≥ 2 ping lenti
  // consecutivi), la latenza API alta è un SINTOMO del DB lento — non un problema
  // indipendente. Cappare p95/p99 a "warn" evita che segnali derivati dalla
  // stessa root cause si sommino nello score e portino il sistema da DEGRADED
  // a BROKEN (ogni "high" vale -18 pt; soglia BROKEN = score < 40).
  const dbSlow = getBgDbLimiterStats().dbSlowPingsConsecutive >= 2;

  const p95Sev: Signal["severity"] = p95 > 3000
    ? (dbSlow ? "warn" : "high")
    : p95 > 1500 ? "warn" : "info";
  const p99Sev: Signal["severity"] = p99 > 8000
    ? (dbSlow ? "warn" : "high")
    : p99 > 4000 ? "warn" : "info";

  return [
    { source: "latency", metric: "latency.p50_ms", value: p50, unit: "ms",
      severity: p50 > 1000 ? "warn" : "info" },
    { source: "latency", metric: "latency.p95_ms", value: p95, unit: "ms",
      severity: p95Sev,
      ...(dbSlow && p95 > 3000 ? { details: { suppressedBy: "db_slow" } } : {}) },
    { source: "latency", metric: "latency.p99_ms", value: p99, unit: "ms",
      severity: p99Sev,
      ...(dbSlow && p99 > 8000 ? { details: { suppressedBy: "db_slow" } } : {}) },
    { source: "latency", metric: "latency.samples", value: samples.length, severity: "info" },
  ];
}

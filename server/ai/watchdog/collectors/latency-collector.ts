// Task #2533 — Collector latenza API. Espone middleware e leggere statistiche.
// Mantiene una rolling window degli ultimi N ms-per-richiesta in-memory.
import type { Request, Response, NextFunction } from "express";
import type { Signal } from "../types";

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
  return [
    { source: "latency", metric: "latency.p50_ms", value: p50, unit: "ms",
      severity: p50 > 1000 ? "warn" : "info" },
    { source: "latency", metric: "latency.p95_ms", value: p95, unit: "ms",
      severity: p95 > 3000 ? "high" : p95 > 1500 ? "warn" : "info" },
    { source: "latency", metric: "latency.p99_ms", value: p99, unit: "ms",
      severity: p99 > 8000 ? "high" : p99 > 4000 ? "warn" : "info" },
    { source: "latency", metric: "latency.samples", value: samples.length, severity: "info" },
  ];
}

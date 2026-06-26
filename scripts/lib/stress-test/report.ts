/**
 * Report finale dello stress test (Task #4970).
 *
 * Compone l'istogramma latenze, le fasi critiche, la lista findings e le
 * raccomandazioni in un oggetto serializzabile, lo scrive su
 * logs/stress-test-YYYY-MM-DD-report.json e ne stampa un summary leggibile a
 * terminale.
 */
import * as fs from "fs";
import { HISTOGRAM_BUCKETS_MS } from "./metrics";
import type { Finding, Scenario, TickSnapshot } from "./types";

export interface FinalReport {
  generatedAt: string;
  scenario: Scenario;
  workers: number;
  durationSec: number;
  elapsedSec: number;
  totalQueries: number;
  totalErrors: number;
  errorRate: number;
  globalMaxMs: number;
  histogram: { leMs: number | string; count: number; pct: number }[];
  errorCodes: Record<string, number>;
  criticalPhases: { tick: number; ts: string; phase: Scenario; p99Ms: number; errorRate: number; poolFullPct: number }[];
  findings: Finding[];
  recommendations: string[];
}

export interface BuildReportInput {
  scenario: Scenario;
  workers: number;
  durationSec: number;
  elapsedSec: number;
  totalQueries: number;
  totalErrors: number;
  globalMaxMs: number;
  histogram: number[];
  errorCodes: Record<string, number>;
  history: TickSnapshot[];
  findings: Finding[];
}

export function buildReport(input: BuildReportInput): FinalReport {
  const totalHist = input.histogram.reduce((a, b) => a + b, 0) || 1;
  const histogram = input.histogram.map((count, i) => ({
    leMs: HISTOGRAM_BUCKETS_MS[i] === Infinity ? "+Inf" : HISTOGRAM_BUCKETS_MS[i],
    count,
    pct: Math.round((count / totalHist) * 1000) / 10,
  }));

  // Fasi critiche: tick con p99 alto, errori o pool pieno.
  const criticalPhases = input.history
    .filter((t) => t.p99Ms >= 500 || t.errorRate >= 0.01 || t.poolFullPct >= 50)
    .slice(0, 50)
    .map((t) => ({
      tick: t.tick,
      ts: t.ts,
      phase: t.phase,
      p99Ms: t.p99Ms,
      errorRate: Math.round(t.errorRate * 10000) / 10000,
      poolFullPct: t.poolFullPct,
    }));

  const recommendations = Array.from(
    new Set(input.findings.filter((f) => f.severity !== "info").map((f) => f.recommendation)),
  );

  return {
    generatedAt: new Date().toISOString(),
    scenario: input.scenario,
    workers: input.workers,
    durationSec: input.durationSec,
    elapsedSec: input.elapsedSec,
    totalQueries: input.totalQueries,
    totalErrors: input.totalErrors,
    errorRate: input.totalQueries ? Math.round((input.totalErrors / input.totalQueries) * 10000) / 10000 : 0,
    globalMaxMs: Math.round(input.globalMaxMs * 100) / 100,
    histogram,
    errorCodes: input.errorCodes,
    criticalPhases,
    findings: input.findings,
    recommendations,
  };
}

export function writeReport(path: string, report: FinalReport): void {
  fs.writeFileSync(path, JSON.stringify(report, null, 2));
}

const SEV_ICON: Record<string, string> = { info: "ℹ️ ", warn: "⚠️ ", critical: "🔴" };

export function printSummary(report: FinalReport, reportPath: string): void {
  const line = "═".repeat(60);
  console.log(`\n${line}`);
  console.log("  DB STRESS TEST — REPORT FINALE");
  console.log(line);
  console.log(`  Scenario:    ${report.scenario}   Workers: ${report.workers}`);
  console.log(`  Durata:      ${report.elapsedSec}s / ${report.durationSec}s richiesti`);
  console.log(`  Query:       ${report.totalQueries}   Errori: ${report.totalErrors} (${(report.errorRate * 100).toFixed(2)}%)`);
  console.log(`  Latenza max: ${report.globalMaxMs}ms`);

  console.log("\n  ── Istogramma latenze ──");
  for (const b of report.histogram) {
    if (b.count === 0) continue;
    const bar = "█".repeat(Math.max(0, Math.round(b.pct / 2)));
    console.log(`    ≤ ${String(b.leMs).padStart(6)}ms  ${String(b.count).padStart(8)}  ${b.pct.toFixed(1)}%  ${bar}`);
  }

  if (Object.keys(report.errorCodes).length > 0) {
    console.log("\n  ── Errori per codice ──");
    for (const [code, n] of Object.entries(report.errorCodes).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${code.padEnd(14)} ${n}`);
    }
  }

  console.log(`\n  ── Findings (${report.findings.length}) ──`);
  const order: Record<string, number> = { critical: 0, warn: 1, info: 2 };
  for (const f of [...report.findings].sort((a, b) => order[a.severity] - order[b.severity])) {
    console.log(`    ${SEV_ICON[f.severity] ?? ""} [${f.severity.toUpperCase()}] (${f.category}) ${f.description}`);
    console.log(`       → ${f.recommendation}`);
  }

  console.log(`\n  Report completo: ${reportPath}`);
  console.log(`${line}\n`);
}

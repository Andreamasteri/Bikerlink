// Task #2533 — Aggregator: raccoglie tutti i signals, calcola HealthSnapshot
// (status verde/giallo/arancio/rosso + score 0..100 + problems[]), persiste
// snapshot + signals, espone "latest" in-memory per consumer realtime.
import { db } from "../../db";
import { systemHealthSnapshot } from "@shared/db";
import { desc } from "drizzle-orm";
import { collectBullMq } from "./collectors/bullmq-collector";
import { collectScheduler } from "./collectors/scheduler-collector";
import { collectDb } from "./collectors/db-collector";
import { collectRedis } from "./collectors/redis-collector";
import { collectLatency } from "./collectors/latency-collector";
import { collectErrors } from "./collectors/error-collector";
import { recordSignals } from "./signals";
import type { HealthSnapshot, Problem, Severity, Signal } from "./types";
import { collectDbIntegrity } from "../db-integrity/collector";

// Task #2536 — wrapper che traduce lo snapshot db-integrity in Signal[] per
// l'aggregator. Mappa severity → watchdog severity (info/warn/high/critical).
async function collectDbIntegritySignals(): Promise<Signal[]> {
  try {
    const snap = await collectDbIntegrity();
    if (!snap.hasRun) return [];
    const out: Signal[] = [];
    if (snap.bySeverity.critical > 0) {
      out.push({ source: "db", metric: "db_integrity.critical_violations",
        severity: "critical", value: snap.bySeverity.critical,
        details: { samples: snap.criticalSamples, lastRunAt: snap.lastRunAt } });
    }
    if (snap.bySeverity.high > 0) {
      out.push({ source: "db", metric: "db_integrity.high_violations",
        severity: "high", value: snap.bySeverity.high });
    }
    if (snap.bySeverity.medium > 0) {
      out.push({ source: "db", metric: "db_integrity.medium_violations",
        severity: "warn", value: snap.bySeverity.medium });
    }
    return out;
  } catch (err) {
    return [{ source: "db", metric: "collector.error", severity: "warn",
      details: { collector: "db-integrity", error: (err as Error).message?.slice(0, 200) } }];
  }
}

const SEVERITY_WEIGHT: Record<Severity, number> = { info: 0, warn: 5, high: 18, critical: 40 };

function deriveProblems(signals: Signal[]): Problem[] {
  const problems: Problem[] = [];
  for (const s of signals) {
    if (s.severity === "info") continue;
    const id = `${s.source}.${s.metric}`;
    let title = s.metric;
    let suggestion: string | undefined;
    if (s.metric.startsWith("queue.") && s.metric.endsWith(".waiting")) {
      title = `Coda ${s.metric.split(".")[1]} congestionata (${s.value} job)`;
      suggestion = "Considera aumento concorrenza worker o restart job stuck.";
    } else if (s.metric.startsWith("queue.") && s.metric.endsWith(".failed")) {
      title = `Coda ${s.metric.split(".")[1]} con ${s.value} job falliti`;
      suggestion = "Verifica errori job, eventualmente rilancia o purga.";
    } else if (s.metric === "scheduler.last_run_min_ago") {
      title = `Scheduler matching: ultimo run ${s.value ?? "?"} min fa`;
      suggestion = "Verifica engine matching, eventualmente restart ciclo.";
    } else if (s.metric === "scheduler.lock_age_min") {
      title = `Lock matching attivo da ${s.value} min`;
      suggestion = "Possibile lock zombie: rilascia lock e fai partire un nuovo ciclo.";
    } else if (s.metric === "db.ping_ms") {
      title = `DB ping lento: ${s.value}ms`;
    } else if (s.metric === "db.connections.active") {
      title = `DB connessioni attive alte: ${s.value}`;
      suggestion = "Riduci pool client o investiga query lente.";
    } else if (s.metric === "db.slow_queries") {
      title = `${s.value} query lente (>500ms medi)`;
    } else if (s.metric === "redis.unreachable") {
      title = "Redis non raggiungibile";
      suggestion = "Verifica REDIS_URL e stato del servizio. Cache potrebbe essere degradata.";
    } else if (s.metric === "latency.p95_ms" || s.metric === "latency.p99_ms") {
      title = `Latenza API ${s.metric}: ${s.value}ms`;
    } else if (s.metric === "http.5xx_per_min") {
      title = `Errori 5xx: ${Number(s.value).toFixed(2)}/min`;
      suggestion = "Controlla logs server e Sentry.";
    } else if (s.metric === "client.crashes_1h") {
      title = `${s.value} crash client nell'ultima ora`;
    } else if (s.metric === "collector.error") {
      title = `Errore collector ${s.source}`;
    }
    problems.push({
      id, severity: s.severity, source: s.source, title, suggestion,
      detail: s.details ? JSON.stringify(s.details).slice(0, 300) : undefined,
    });
  }
  return problems;
}

function computeStatus(problems: Problem[]): { status: HealthSnapshot["status"]; score: number } {
  let penalty = 0;
  for (const p of problems) penalty += SEVERITY_WEIGHT[p.severity] ?? 0;
  const score = Math.max(0, 100 - penalty);
  const status: HealthSnapshot["status"] =
    score >= 90 ? "green" :
    score >= 70 ? "yellow" :
    score >= 40 ? "orange" : "red";
  return { status, score };
}

let latest: HealthSnapshot | null = null;
const subscribers = new Set<(s: HealthSnapshot) => void>();

export function getLatestSnapshot(): HealthSnapshot | null { return latest; }
export function subscribeSnapshot(cb: (s: HealthSnapshot) => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

export async function runAggregatorCycle(): Promise<HealthSnapshot> {
  const collectors = await Promise.allSettled([
    collectBullMq(), collectScheduler(), collectDb(),
    collectRedis(), collectLatency(), collectErrors(),
    collectDbIntegritySignals(),
  ]);
  const signals: Signal[] = [];
  for (const r of collectors) {
    if (r.status === "fulfilled") signals.push(...r.value);
    else signals.push({ source: "app", metric: "collector.crash", severity: "warn", details: { error: String(r.reason) } });
  }
  // persisti solo signals non-info (ridurre noise nel DB)
  await recordSignals(signals.filter((s) => s.severity !== "info"));

  const problems = deriveProblems(signals);
  const { status, score } = computeStatus(problems);
  const metrics: Record<string, number> = {};
  for (const s of signals) if (typeof s.value === "number") metrics[`${s.source}.${s.metric}`] = s.value;

  const snap: HealthSnapshot = {
    status, score, problems, metrics, generatedAt: new Date().toISOString(),
  };
  latest = snap;
  // persist snapshot (best-effort)
  try {
    await db.insert(systemHealthSnapshot).values({
      status, score,
      problems: problems as unknown as typeof systemHealthSnapshot.$inferInsert["problems"],
      metrics: metrics as object,
    });
  } catch (err) {
    console.warn("[watchdog/aggregator] persist snapshot error:", err);
  }
  for (const cb of subscribers) { try { cb(snap); } catch { /* ignore */ } }
  return snap;
}

export async function getRecentSnapshots(limit = 60): Promise<Array<{
  status: string; score: number; createdAt: string;
}>> {
  try {
    const rows = await db.select({
      status: systemHealthSnapshot.status,
      score: systemHealthSnapshot.score,
      createdAt: systemHealthSnapshot.createdAt,
    }).from(systemHealthSnapshot)
      .orderBy(desc(systemHealthSnapshot.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      status: r.status, score: r.score,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }));
  } catch {
    return [];
  }
}

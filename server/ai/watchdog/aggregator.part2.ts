import { db } from "../../db";
import { systemHealthSnapshot } from "@shared/db";
import { desc } from "drizzle-orm";
import type { HealthSnapshot, Problem, Severity, Signal } from "./types";
import { recordSignals } from "./signals";
import {
  SEVERITY_WEIGHT,
  deriveProblems,
  suppressDownstreamWhenPoweredOff,
  collectDbIntegritySignals,
  collectAdsOrphanSignals,
  collectEmbeddingSignals,
} from "./aggregator";
import { collectBullMq } from "./collectors/bullmq-collector";
import { collectDb } from "./collectors/db-collector";
import { collectDragonfly } from "./collectors/dragonfly-collector";
import { collectLatency } from "./collectors/latency-collector";
import { collectPool } from "./collectors/pool-collector";
import { collectMaps } from "./collectors/maps-collector";
import { collectScheduler } from "./collectors/scheduler-collector";
import { collectErrors } from "./collectors/error-collector";
import { collectRestarts } from "./collectors/restart-collector";
import { collectCrashSignals } from "./collectors/crash-signals-collector";
import { collectRoutingCorrectness } from "./collectors/routing-correctness-collector";
import { withBgDbSlot } from "../../lib/bg-db-limiter";
import { isThinkCentreOffline } from "../../lib/thinkcentre-offline";
import { setHealthState } from "../../lib/health-arbiter";

let latest: HealthSnapshot | null = null;
const subscribers = new Set<(s: HealthSnapshot) => void>();

export function getLatestSnapshot(): HealthSnapshot | null { return latest; }
export function subscribeSnapshot(cb: (s: HealthSnapshot) => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
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

export async function runAggregatorCycle(): Promise<HealthSnapshot> {
  const collectors = await Promise.allSettled([
    collectBullMq(), collectDb(), collectDragonfly(), collectLatency(),
    Promise.resolve(collectPool()), collectMaps(),
    // Routing-correctness (namespace "horus"): sonde di rete lente come collectMaps,
    // quindi FUORI da withBgDbSlot (le sue eventuali query DB sono già cachate/interne).
    collectRoutingCorrectness(),
    withBgDbSlot(() => collectScheduler()),
    withBgDbSlot(() => collectErrors()),
    withBgDbSlot(() => collectDbIntegritySignals()),
    withBgDbSlot(() => collectEmbeddingSignals()),
    withBgDbSlot(() => collectRestarts()),
    withBgDbSlot(() => collectAdsOrphanSignals()),
    withBgDbSlot(() => collectCrashSignals()),
  ]);
  const signals: Signal[] = [];
  for (const r of collectors) {
    if (r.status === "fulfilled") signals.push(...r.value);
    else signals.push({ source: "app", metric: "collector.crash", severity: "warn", details: { error: String(r.reason) } });
  }
  await recordSignals(signals.filter((s) => s.severity !== "info"));

  let problems = deriveProblems(signals);

  try {
    if (await withBgDbSlot(() => isThinkCentreOffline())) {
      problems = suppressDownstreamWhenPoweredOff(problems);
    }
  } catch { /* fail-safe */ }

  let { status, score } = computeStatus(problems);

  const MAX_SCORE_DROP_PER_CYCLE = 35;
  if (latest !== null) {
    const ageMs = Date.now() - new Date(latest.generatedAt).getTime();
    if (ageMs <= 5 * 60 * 1000) {
      const lastScore = latest.score;
      if (lastScore - score > MAX_SCORE_DROP_PER_CYCLE) {
        const clampedScore = Math.max(0, lastScore - MAX_SCORE_DROP_PER_CYCLE);
        console.warn(
          `[watchdog/aggregator] score damping attivo: ${score}→${clampedScore} ` +
          `(drop ${lastScore - score} > ${MAX_SCORE_DROP_PER_CYCLE}, last=${lastScore})`,
        );
        score = clampedScore;
        status =
          score >= 90 ? "green" :
          score >= 70 ? "yellow" :
          score >= 40 ? "orange" : "red";
      }
    }
  }

  const metrics: Record<string, number> = {};
  for (const s of signals) if (typeof s.value === "number") metrics[`${s.source}.${s.metric}`] = s.value;

  const snap: HealthSnapshot = {
    status, score, problems, metrics, generatedAt: new Date().toISOString(),
  };
  latest = snap;

  // Observability slice: traduce lo status del semaforo watchdog nello stato
  // dell'Health Arbiter. green ⇒ READY, yellow/orange ⇒ DEGRADED, red ⇒ BROKEN.
  // I motivi sono i titoli dei problemi critical/high (massimo 5).
  const arbiterReasons = problems
    .filter((p) => p.severity === "critical" || p.severity === "high")
    .slice(0, 5)
    .map((p) => p.title);
  const arbiterState = status === "green" ? "READY" : status === "red" ? "BROKEN" : "DEGRADED";
  setHealthState("watchdog", arbiterState, arbiterState === "READY" ? [] : arbiterReasons);

  try {
    const safeProblems = JSON.parse(JSON.stringify(problems)) as typeof problems;
    const safeMetrics = JSON.parse(JSON.stringify(metrics)) as typeof metrics;
    await db.insert(systemHealthSnapshot).values({
      status,
      score: Math.round(score),
      problems: safeProblems as unknown as typeof systemHealthSnapshot.$inferInsert["problems"],
      metrics: safeMetrics as object,
    });
  } catch (err) {
    const msg = (err as Error).message ?? "unknown";
    console.warn(`[watchdog/aggregator] persist snapshot error (status=${status} score=${score} problems=${problems.length}): ${msg}`);
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

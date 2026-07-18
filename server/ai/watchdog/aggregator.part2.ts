import { db } from "../../db";
import { systemHealthSnapshot } from "@shared/db";
import { desc } from "drizzle-orm";
import type { HealthSnapshot, Problem, Signal } from "./types";
import { recordSignals } from "./signals";
import {
  SEVERITY_WEIGHT,
  deriveProblems,
  buildDerivedProblems,
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
import { collectOverload } from "./collectors/overload-collector";
import { collectAiHub } from "./collectors/ai-hub-collector";
import { collectTcReboot } from "./collectors/tc-reboot-collector";
import { withBgDbSlot } from "../../lib/bg-db-limiter";
import { isThinkCentreOffline } from "../../lib/thinkcentre-offline";
import { setHealthState } from "../../lib/health-arbiter";
import { recordDbMonitorSample } from "../../db-monitor-history";

let latest: HealthSnapshot | null = null;
const subscribers = new Set<(s: HealthSnapshot) => void>();

// Task #154 — Guardia in-process: true mentre un ciclo aggregator è in corso.
// L'endpoint admin di reset-state la interroga per evitare di azzerare i
// contatori dei collector proprio mentre un ciclo li sta leggendo (race).
let cycleInFlight = false;
export function isAggregatorCycleInFlight(): boolean { return cycleInFlight; }

// Task #567 — Snooze: quando l'admin preme "Svuota lista errori", i problemi
// vengono filtrati dalla UI per 10 minuti. I problemi CRITICAL tornano visibili
// dopo 2 minuti (sicurezza). I dati grezzi (recordDbMonitorSample) non sono
// influenzati dallo snooze per mantenere la storia accurata.
let snoozedUntil: Date | null = null;
let snoozedAt: Date | null = null;

export function getSnoozedUntil(): Date | null { return snoozedUntil; }
export function setSnoozedUntil(until: Date | null): void {
  snoozedUntil = until;
  snoozedAt = until ? new Date() : null;
}

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
  cycleInFlight = true;
  try {
    return await runAggregatorCycleInner();
  } finally {
    cycleInFlight = false;
  }
}

async function runAggregatorCycleInner(): Promise<HealthSnapshot> {
  const collectors = await Promise.allSettled([
    collectBullMq(), collectDb(), collectDragonfly(), collectLatency(),
    Promise.resolve(collectPool()), collectMaps(),
    // ai-hub TC (Task #153): probe HTTP di rete lenta come collectMaps → FUORI
    // da withBgDbSlot (nessuna query DB). Aggiorna isHubAvailable() usato dai tool.
    collectAiHub(),
    // TC reboot latency (Task #178): misura il gap down→up per rilevare reboot
    // lenti (>90s) causati da bug kernel (cgroup_drain_dying). Probe HTTP leggera,
    // nessuna query DB → FUORI da withBgDbSlot.
    collectTcReboot(),
    // Routing-correctness (namespace "horus"): sonde di rete lente come collectMaps,
    // quindi FUORI da withBgDbSlot (le sue eventuali query DB sono già cachate/interne).
    collectRoutingCorrectness(),
    // Overload sostenuto (Task #72): zero-I/O, legge lo snapshot in memoria
    // depositato al tick precedente da recordDbMonitorSample.
    Promise.resolve(collectOverload()),
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

  // Fase 5 — pipeline a due stadi: primary signals → deriveProblems,
  // derived signals → buildDerivedProblems separatamente (no feedback loop).
  let problems = [...deriveProblems(signals), ...buildDerivedProblems(signals)];

  try {
    if (await withBgDbSlot(() => isThinkCentreOffline())) {
      problems = suppressDownstreamWhenPoweredOff(problems);
    }
  } catch { /* fail-safe */ }

  // Calcola metrics prima del snooze — usate sia per il DB monitor history
  // (dati reali) sia per lo snapshot UI.
  const metrics: Record<string, number> = {};
  for (const s of signals) if (typeof s.value === "number") metrics[`${s.source}.${s.metric}`] = s.value;

  // Task #567 — Record DB monitor history with REAL (unfiltered) problems, before
  // snooze. The history must reflect reality even while the UI is snoozed.
  recordDbMonitorSample({ problems, metrics }).catch(() => { /* non-fatale */ });

  // Task #567 — Snooze filter: se l'admin ha premuto "Svuota lista", nascondi i
  // problemi dalla UI per 10 minuti. I problemi CRITICAL tornano visibili dopo
  // 2 minuti come rete di sicurezza. Se lo snooze è scaduto, lo azzeriamo.
  const snoozeNow = Date.now();
  let visibleProblems = problems;
  if (snoozedUntil) {
    if (snoozeNow >= snoozedUntil.getTime()) {
      snoozedUntil = null;
      snoozedAt = null;
    } else {
      const snoozeAgeMs = snoozedAt ? snoozeNow - snoozedAt.getTime() : 0;
      const criticalBypassActive = snoozeAgeMs > 2 * 60 * 1000;
      visibleProblems = problems.filter(
        (p) => p.severity === "critical" && criticalBypassActive,
      );
    }
  }

  let { status, score } = computeStatus(visibleProblems);

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

  const snap: HealthSnapshot = {
    status, score, problems: visibleProblems, metrics, generatedAt: new Date().toISOString(),
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

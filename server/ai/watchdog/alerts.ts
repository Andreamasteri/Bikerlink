// Task #2533 — Invio alert per snapshot critici. Push agli admin + WS realtime.
// Throttle: max 1 alert ogni 10 min per (status, problemId) combo.
import type { HealthSnapshot } from "./types";
import { writeWatchdogLog } from "./log";
import { emitWatchdogAlert, emitWatchdogStatusChange } from "../coordinator/integrations/watchdog";
import { isMapsFlagEnabled } from "./maps-kill-switch";
import { logger } from "../../lib/logger";
import { sendSystemAlertPushToAdmins } from "../../push-notifications";

const mapsLog = logger.child({ scope: "maps-watchdog", layer: "alerts" });

const ALERT_TTL_MS = 10 * 60 * 1000;
const sent = new Map<string, number>();

interface AdminWsBroadcast { (msg: { type: string; payload: unknown }): void }
let wsBroadcast: AdminWsBroadcast | null = null;
export function registerAdminWsBroadcast(fn: AdminWsBroadcast): void { wsBroadcast = fn; }

function shouldSend(key: string): boolean {
  const now = Date.now();
  const last = sent.get(key) ?? 0;
  if (now - last < ALERT_TTL_MS) return false;
  sent.set(key, now);
  return true;
}

export async function dispatchAlerts(snap: HealthSnapshot): Promise<{ sent: number }> {
  // Snapshot-level (status change → red/orange)
  let sentCount = 0;
  // Task #2654 — Emit al Coordinator (graceful, non blocca)
  if (snap.status === "red" || snap.status === "orange") {
    await emitWatchdogStatusChange({
      status: snap.status,
      score: snap.score,
      topProblem: snap.problems[0]?.title ?? null,
    });
  }
  if ((snap.status === "red" || snap.status === "orange") && shouldSend(`status.${snap.status}`)) {
    const icon = snap.status === "red" ? "🔴" : "🟠";
    const top = snap.problems[0]?.title ?? "Problema sistema";
    const n = await sendSystemAlertPushToAdmins(
      `${icon} Sistema ${snap.status === "red" ? "CRITICO" : "degradato"}`,
      `Score ${snap.score}/100 — ${top}`,
      { type: "watchdog_status", status: snap.status, score: snap.score },
    );
    sentCount += n;
    await writeWatchdogLog({
      kind: "alert", scope: `status.${snap.status}`, status: "ok",
      summary: `Alert status ${snap.status} inviato a ${n} admin`,
      details: { snapshotProblems: snap.problems.length, score: snap.score },
    });
  }

  // Pool exhaustion — dedicated alert (higher priority than generic critical loop)
  const poolProblem = snap.problems.find(
    (p) => p.id === "db.db.pool.waiting" && p.severity === "critical",
  );
  if (poolProblem) {
    await emitWatchdogAlert({ problem: poolProblem, score: snap.score, status: snap.status });
    if (shouldSend("db.pool.exhaustion")) {
      let detail: { max?: number; total?: number; consecutiveWaiting?: number } = {};
      try { detail = JSON.parse(poolProblem.detail ?? "{}"); } catch { /* use defaults */ }
      const waiting = snap.metrics["db.db.pool.waiting"] ?? "?";
      const max = detail.max ?? 10;
      const consecutive = detail.consecutiveWaiting != null ? ` (${detail.consecutiveWaiting} tick consecutivi)` : "";
      const n = await sendSystemAlertPushToAdmins(
        `💀 Pool DB esaurito — ${waiting}/${max} client in attesa`,
        `Il pool è completamente saturo${consecutive}. Controlla query lente/lock e valuta di aumentare pool.max.`,
        { type: "watchdog_pool_exhaustion", waiting, max, score: snap.score },
      );
      sentCount += n;
      await writeWatchdogLog({
        kind: "alert", scope: "db.pool.exhaustion", status: "ok",
        summary: `Alert pool DB esaurito: ${waiting}/${max} client in attesa`,
        details: { sent: n, waiting, max, consecutive: detail.consecutiveWaiting },
      });
    }
  }

  // Instabilità di rete — alert dedicato per ≥2 engine down contemporaneamente.
  // Severity "high" (non critical) per evitare rumore eccessivo ma comunque notificato.
  // Gate sulla severity: questo path dedicato bypassa il loop critical-only sotto,
  // quindi se la severity viene declassata (es. soppressione downstream a "warn")
  // NON deve comunque emettere push. Solo high/critical notificano.
  const netInstabilityProblem = snap.problems.find(
    (p) => p.id === "maps.health.network_instability",
  );
  if (
    netInstabilityProblem &&
    (netInstabilityProblem.severity === "high" || netInstabilityProblem.severity === "critical")
  ) {
    await emitWatchdogAlert({ problem: netInstabilityProblem, score: snap.score, status: snap.status });
    const mapsAlertsOn = await isMapsFlagEnabled("alerts");
    if (mapsAlertsOn && shouldSend("maps.network_instability")) {
      const n = await sendSystemAlertPushToAdmins(
        `🌐 ${netInstabilityProblem.title}`,
        netInstabilityProblem.suggestion ?? "Verifica connettività Replit.",
        { type: "watchdog_network_instability", score: snap.score, status: snap.status },
      );
      sentCount += n;
      await writeWatchdogLog({
        kind: "alert", scope: "maps.network_instability", status: "ok",
        summary: `Alert instabilità di rete: ${netInstabilityProblem.title}`,
        details: { sent: n, suggestion: netInstabilityProblem.suggestion },
      });
    }
  }

  // Problem-level (critical singoli — pool exhaustion e network_instability già gestite sopra)
  for (const p of snap.problems) {
    if (p.severity !== "critical") continue;
    if (p.id === "db.db.pool.waiting") continue; // già gestita nel blocco pool dedicato
    // Task #2654 — emit ogni problem critical anche se throttled (lo throttle è solo per push)
    await emitWatchdogAlert({ problem: p, score: snap.score, status: snap.status });
    // Task #2686 — kill-switch dedicato per push mappe.
    if (p.source === "maps") {
      const mapsAlertsOn = await isMapsFlagEnabled("alerts");
      if (!mapsAlertsOn) {
        mapsLog.info({ problemId: p.id }, "push maps soppressa da kill-switch");
        continue;
      }
    }
    if (!shouldSend(`problem.${p.id}`)) continue;
    const n = await sendSystemAlertPushToAdmins(
      `🚨 ${p.title}`,
      p.suggestion ?? "Verifica system-health admin.",
      { type: "watchdog_problem", problemId: p.id, severity: p.severity, source: p.source },
    );
    sentCount += n;
    await writeWatchdogLog({
      kind: "alert", scope: p.id, status: "ok",
      summary: `Alert critical: ${p.title}`,
      details: { sent: n, suggestion: p.suggestion },
    });
  }

  // WS broadcast (sempre, non throttled)
  try { wsBroadcast?.({ type: "watchdog_snapshot", payload: snap }); } catch { /* ignore */ }

  return { sent: sentCount };
}

export function _resetThrottleForTests(): void { sent.clear(); }

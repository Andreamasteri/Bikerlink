// Task #2533 — Invio alert per snapshot critici. Push agli admin + WS realtime.
// Throttle: max 1 alert ogni 10 min per (status, problemId) combo.
import { db } from "../../db";
import { users } from "@shared/db";
import { eq } from "drizzle-orm";
import type { HealthSnapshot } from "./types";
import { writeWatchdogLog } from "./log";
import { emitWatchdogAlert, emitWatchdogStatusChange } from "../coordinator/integrations/watchdog";
import { isMapsFlagEnabled } from "./maps-kill-switch";
import { logger } from "../../lib/logger";

const mapsLog = logger.child({ scope: "maps-watchdog", layer: "alerts" });

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
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

async function pushAdmins(title: string, body: string, data: Record<string, unknown>): Promise<number> {
  try {
    const rows = await db.select({ token: users.expoPushToken }).from(users).where(eq(users.role, "admin"));
    const msgs = rows
      .map((r) => r.token)
      .filter((t): t is string => !!t && (t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken[")))
      .map((to) => ({ to, title, body, sound: "default", channelId: "matches", data }));
    if (msgs.length === 0) return 0;
    const resp = await fetch(EXPO_PUSH_URL, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(msgs),
    });
    if (!resp.ok) console.warn("[watchdog/alerts] push HTTP", resp.status);
    return msgs.length;
  } catch (err) {
    console.warn("[watchdog/alerts] push error:", err);
    return 0;
  }
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
    const n = await pushAdmins(
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

  // Problem-level (critical singoli)
  for (const p of snap.problems) {
    if (p.severity !== "critical") continue;
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
    const n = await pushAdmins(
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

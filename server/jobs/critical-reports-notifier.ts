// Task #2548 — Job notifier critical reports. Ogni 5 minuti scansiona i
// report critical/high non assegnati e non risolti da > 15 min e invia un
// push agli admin/moderatori online. Throttle: max 1 push per report ogni
// N minuti (default 60, configurabile via CRITICAL_NOTIFIER_THROTTLE_MIN).
//
// Sfasamento thundering-herd: cron parte al minuto :02/:07/:12/... (non :00)
// per non collidere con OTA auto-rollback (:00) e unban (:01).
import { Cron } from "croner";
import { db } from "../db";
import { reports, users } from "@shared/db";
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { withDbRetry } from "../lib/db-retry";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const THROTTLE_MIN = Math.max(1, Number(process.env.CRITICAL_NOTIFIER_THROTTLE_MIN) || 60);
const THROTTLE_MS = THROTTLE_MIN * 60 * 1000;
const STALE_MS = 15 * 60 * 1000;
const lastPushed = new Map<string, number>();
let cron: Cron | null = null;

async function pushModerators(title: string, body: string, data: Record<string, unknown>): Promise<number> {
  try {
    const rows = await withDbRetry("[critical-notifier]", () =>
      db.select({ token: users.expoPushToken })
        .from(users)
        .where(and(
          eq(users.status, "active"),
          inArray(users.role, ["admin", "moderator"]),
        )),
    );
    const msgs = rows
      .map((r) => r.token)
      .filter((t): t is string => !!t && (t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken[")))
      .map((to) => ({ to, title, body, sound: "default" as const, channelId: "matches", data }));
    if (msgs.length === 0) return 0;
    const resp = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(msgs),
    });
    if (!resp.ok) console.warn("[critical-notifier] push HTTP", resp.status);
    return msgs.length;
  } catch (err) {
    console.warn("[critical-notifier] push error:", err);
    return 0;
  }
}

export async function scanAndNotifyCriticalReports(): Promise<{ scanned: number; notified: number }> {
  const cutoff = new Date(Date.now() - STALE_MS);
  let rows: { id: string; severity: string; category: string | null; reportedUserId: string }[];
  try {
    rows = await withDbRetry("[critical-notifier]", () =>
      db.select({
        id: reports.id,
        severity: reports.severity,
        category: reports.category,
        reportedUserId: reports.reportedUserId,
      })
        .from(reports)
        .where(and(
          eq(reports.status, "pending"),
          isNull(reports.assignedModeratorId),
          or(eq(reports.severity, "critical"), eq(reports.severity, "high")),
          lt(reports.createdAt, cutoff),
        ))
        .limit(50),
    );
  } catch (err) {
    console.warn("[critical-notifier] scan error:", err);
    return { scanned: 0, notified: 0 };
  }

  let notified = 0;
  const now = Date.now();
  for (const r of rows) {
    const last = lastPushed.get(r.id) ?? 0;
    if (now - last < THROTTLE_MS) continue;
    lastPushed.set(r.id, now);
    const sent = await pushModerators(
      `🚨 Report ${r.severity}`,
      `Categoria ${r.category ?? "?"} non assegnata da oltre 15 min`,
      { type: "critical_report", reportId: r.id, severity: r.severity },
    );
    if (sent > 0) notified++;
  }
  return { scanned: rows.length, notified };
}

export function startCriticalReportsNotifier(): void {
  if (cron) return;
  try {
    // Cron al minuto :02 di ogni slot di 5 min → :02, :07, :12, :17, :22, :27, :32, :37, :42, :47, :52, :57
    // Sfasato rispetto a OTA auto-rollback (:00) e unban (:01) per distribuire il carico sul pool DB.
    cron = new Cron("2-59/5 * * * *", { timezone: "Europe/Rome" }, async () => {
      try {
        const out = await scanAndNotifyCriticalReports();
        if (out.notified > 0) {
          console.log(`[critical-notifier] notified ${out.notified}/${out.scanned} report critici`);
        }
      } catch (err) {
        console.warn("[critical-notifier] cron error:", err);
      }
    });
    console.log(`[critical-notifier] scheduler attivo (ogni 5 min al :02, Europe/Rome) throttle=${THROTTLE_MIN}min`);
  } catch (err) {
    console.warn("[critical-notifier] init error:", err);
  }
}

export function stopCriticalReportsNotifier(): void {
  if (cron) { cron.stop(); cron = null; }
  lastPushed.clear();
}

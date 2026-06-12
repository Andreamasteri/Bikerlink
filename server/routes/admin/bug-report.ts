// Task #3894 — Endpoint raccolta bug consolidata per il FAB admin.
// Aggrega crash_logs, system_signals (high/critical), ai_watchdog_log (error).
import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { appCrashLogs, systemSignals, aiWatchdogLog } from "@shared/db";
import { desc, inArray, eq } from "drizzle-orm";

const router = Router();

router.get("/bug-report/recent", async (_req: Request, res: Response) => {
  try {
    const [crashes, signals, watchdogErrors] = await Promise.all([
      db
        .select({
          id: appCrashLogs.id,
          crashType: appCrashLogs.crashType,
          errorMessage: appCrashLogs.errorMessage,
          appVersion: appCrashLogs.appVersion,
          platform: appCrashLogs.platform,
          deviceModel: appCrashLogs.deviceModel,
          createdAt: appCrashLogs.reportedAt,
        })
        .from(appCrashLogs)
        .where(inArray(appCrashLogs.crashType, ["crash_system", "crash_js"]))
        .orderBy(desc(appCrashLogs.reportedAt))
        .limit(10),

      db
        .select({
          id: systemSignals.id,
          source: systemSignals.source,
          metric: systemSignals.metric,
          severity: systemSignals.severity,
          value: systemSignals.value,
          unit: systemSignals.unit,
          createdAt: systemSignals.createdAt,
        })
        .from(systemSignals)
        .where(inArray(systemSignals.severity, ["high", "critical"]))
        .orderBy(desc(systemSignals.createdAt))
        .limit(5),

      db
        .select({
          id: aiWatchdogLog.id,
          kind: aiWatchdogLog.kind,
          scope: aiWatchdogLog.scope,
          status: aiWatchdogLog.status,
          summary: aiWatchdogLog.summary,
          createdAt: aiWatchdogLog.createdAt,
        })
        .from(aiWatchdogLog)
        .where(eq(aiWatchdogLog.status, "error"))
        .orderBy(desc(aiWatchdogLog.createdAt))
        .limit(5),
    ]);

    const items = [
      ...crashes.map((c) => ({
        id: c.id,
        source: "crash" as const,
        severity: "critical" as const,
        title: c.crashType === "crash_js" ? "JS Crash" : "System Crash",
        message: c.errorMessage ?? "Nessun messaggio",
        detail: `${c.platform ?? "?"} · ${c.deviceModel ?? "?"} · v${c.appVersion ?? "?"}`,
        createdAt: (c.createdAt as Date).toISOString(),
      })),
      ...signals.map((s) => ({
        id: s.id,
        source: "signal" as const,
        severity: s.severity as "high" | "critical",
        title: `Signal: ${s.metric}`,
        message: `[${s.source}] ${s.metric}${s.value != null ? ` = ${s.value}${s.unit ? " " + s.unit : ""}` : ""}`,
        detail: s.severity.toUpperCase(),
        createdAt: (s.createdAt as Date).toISOString(),
      })),
      ...watchdogErrors.map((w) => ({
        id: w.id,
        source: "watchdog" as const,
        severity: "high" as const,
        title: `Watchdog error: ${w.kind}${w.scope ? " · " + w.scope : ""}`,
        message: w.summary ?? "Nessun sommario",
        detail: w.scope ?? "",
        createdAt: (w.createdAt as Date).toISOString(),
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ items, total: items.length });
  } catch (err) {
    console.error("[bug-report] error:", err);
    res.status(500).json({ error: "Errore interno" });
  }
});

export default router;

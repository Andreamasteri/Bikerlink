// Task #3894 — Endpoint raccolta bug consolidata per il FAB admin.
// Aggrega per gruppo (deduplicando ripetizioni) da: crash_logs, system_signals
// (high/critical), ai_watchdog_log (status=error).
import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/bug-report/recent", async (_req: Request, res: Response) => {
  try {
    const [crashRows, signalRows, watchdogRows] = await Promise.all([
      // Crash raggruppati per tipo + messaggio (prime 200 chars) — mostra count ripetizioni
      db.execute(sql`
        SELECT
          crash_type,
          COALESCE(LEFT(error_message, 200), 'no-message') AS msg_key,
          COUNT(*)::int AS count,
          MAX(reported_at) AS latest_at,
          MAX(app_version) AS app_version,
          MAX(platform) AS platform,
          MAX(device_model) AS device_model
        FROM app_crash_logs
        WHERE crash_type IN ('crash_system', 'crash_js')
        GROUP BY crash_type, COALESCE(LEFT(error_message, 200), 'no-message')
        ORDER BY latest_at DESC, count DESC
        LIMIT 10
      `),

      // Signal raggruppati per metric + severity — high/critical
      db.execute(sql`
        SELECT
          source,
          metric,
          severity,
          COUNT(*)::int AS count,
          MAX(created_at) AS latest_at,
          AVG(value) AS avg_value,
          MAX(unit) AS unit
        FROM system_signals
        WHERE severity IN ('high', 'critical')
        GROUP BY source, metric, severity
        ORDER BY latest_at DESC, count DESC
        LIMIT 5
      `),

      // AI Watchdog raggruppati per kind + scope (errori)
      db.execute(sql`
        SELECT
          kind,
          scope,
          status,
          COUNT(*)::int AS count,
          MAX(created_at) AS latest_at,
          MAX(summary) AS summary
        FROM ai_watchdog_log
        WHERE status = 'error'
        GROUP BY kind, scope, status
        ORDER BY latest_at DESC, count DESC
        LIMIT 5
      `),
    ]);

    type CrashRow = { crash_type: string; msg_key: string; count: number; latest_at: Date; app_version: string | null; platform: string | null; device_model: string | null };
    type SignalRow = { source: string; metric: string; severity: string; count: number; latest_at: Date; avg_value: number | null; unit: string | null };
    type WatchdogRow = { kind: string; scope: string | null; status: string; count: number; latest_at: Date; summary: string | null };

    const items = [
      ...(crashRows.rows as CrashRow[]).map((c, i) => ({
        id: `crash-${i}`,
        source: "crash" as const,
        severity: "critical" as const,
        title: c.crash_type === "crash_js" ? "JS Crash" : "System Crash",
        message: c.msg_key === "no-message" ? "Nessun messaggio" : c.msg_key,
        detail: `${c.platform ?? "?"} · ${c.device_model ?? "?"} · v${c.app_version ?? "?"}`,
        count: c.count,
        createdAt: (c.latest_at as Date).toISOString(),
      })),
      ...(signalRows.rows as SignalRow[]).map((s, i) => ({
        id: `signal-${i}`,
        source: "signal" as const,
        severity: s.severity as "high" | "critical",
        title: `Signal: ${s.metric}`,
        message: `[${s.source}] ${s.metric}${s.avg_value != null ? ` ≈ ${Math.round(s.avg_value)}${s.unit ? " " + s.unit : ""}` : ""}`,
        detail: s.severity.toUpperCase(),
        count: s.count,
        createdAt: (s.latest_at as Date).toISOString(),
      })),
      ...(watchdogRows.rows as WatchdogRow[]).map((w, i) => ({
        id: `watchdog-${i}`,
        source: "watchdog" as const,
        severity: "high" as const,
        title: `AI audit error: ${w.kind}${w.scope ? " · " + w.scope : ""}`,
        message: w.summary ?? "Nessun sommario",
        detail: w.scope ?? "",
        count: w.count,
        createdAt: (w.latest_at as Date).toISOString(),
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ items, total: items.length });
  } catch (err) {
    console.error("[bug-report] error:", err);
    res.status(500).json({ error: "Errore interno" });
  }
});

export default router;

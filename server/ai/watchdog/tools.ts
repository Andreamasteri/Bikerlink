// Task #2533 — Tool read-only per la chat AI watchdog. Niente mutazioni.
import { tool } from "ai";
import { z } from "zod";
import { db } from "../../db";
import { systemSignals, systemHealthSnapshot, aiWatchdogLog, appCrashLogs } from "@shared/db";
import { desc, gte, eq, and, sql } from "drizzle-orm";
import { getLatestSnapshot } from "./aggregator";

export function buildTools() {
  return {
    getSnapshot: tool({
      description: "Stato corrente del sistema (status, score, problems, metrics).",
      inputSchema: z.object({}),
      execute: async () => {
        const s = getLatestSnapshot();
        if (!s) return { error: "nessun snapshot disponibile" };
        return s;
      },
    }),
    getRecentSignals: tool({
      description: "Ultimi signals raccolti, filtrabili per source.",
      inputSchema: z.object({
        source: z.enum(["bullmq", "scheduler", "db", "dragonfly", "latency", "error", "app"]).optional(),
        minutes: z.number().int().min(1).max(720).default(60),
        limit: z.number().int().min(1).max(200).default(50),
      }),
      execute: async ({ source, minutes, limit }) => {
        const since = new Date(Date.now() - minutes * 60_000);
        const where = source
          ? and(gte(systemSignals.createdAt, since), eq(systemSignals.source, source))
          : gte(systemSignals.createdAt, since);
        const rows = await db.select().from(systemSignals)
          .where(where).orderBy(desc(systemSignals.createdAt)).limit(limit);
        return rows.map((r) => ({
          source: r.source, metric: r.metric, value: r.value, severity: r.severity,
          details: r.details,
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        }));
      },
    }),
    getHealthTrend: tool({
      description: "Trend storico degli snapshot (score nel tempo).",
      inputSchema: z.object({ limit: z.number().int().min(1).max(200).default(60) }),
      execute: async ({ limit }) => {
        const rows = await db.select({
          status: systemHealthSnapshot.status, score: systemHealthSnapshot.score,
          createdAt: systemHealthSnapshot.createdAt,
        }).from(systemHealthSnapshot)
          .orderBy(desc(systemHealthSnapshot.createdAt)).limit(limit);
        return rows.map((r) => ({
          status: r.status, score: r.score,
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        }));
      },
    }),
    getRecentLogs: tool({
      description: "Recenti azioni del watchdog (auto-fix, proposte, alert, chat).",
      inputSchema: z.object({
        kind: z.enum(["auto_fix", "proposal", "alert", "chat", "report", "signal"]).optional(),
        limit: z.number().int().min(1).max(100).default(30),
      }),
      execute: async ({ kind, limit }) => {
        const rows = await (kind
          ? db.select().from(aiWatchdogLog).where(eq(aiWatchdogLog.kind, kind))
              .orderBy(desc(aiWatchdogLog.createdAt)).limit(limit)
          : db.select().from(aiWatchdogLog).orderBy(desc(aiWatchdogLog.createdAt)).limit(limit));
        return rows.map((r) => ({
          id: r.id, kind: r.kind, scope: r.scope, status: r.status,
          summary: r.summary, costUsd: r.costUsd,
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        }));
      },
    }),
    getMetricAggregate: tool({
      description: "Aggregato min/max/avg di una metrica nelle ultime N ore.",
      inputSchema: z.object({
        metric: z.string().min(1).max(80),
        hours: z.number().int().min(1).max(72).default(1),
      }),
      execute: async ({ metric, hours }) => {
        const since = new Date(Date.now() - hours * 3600_000);
        const r = await db.execute<{ avg: number; min: number; max: number; n: number }>(sql`
          SELECT AVG(value)::float AS avg, MIN(value)::float AS min, MAX(value)::float AS max, COUNT(*)::int AS n
          FROM system_signals
          WHERE metric = ${metric} AND created_at >= ${since}
        `);
        const row = (r as { rows?: Array<{ avg: number; min: number; max: number; n: number }> }).rows?.[0];
        return row ?? { avg: null, min: null, max: null, n: 0 };
      },
    }),
    getRecentCrashes: tool({
      description: "Crash client recenti (ultima ora) — aggregato per platform/type.",
      inputSchema: z.object({}),
      execute: async () => {
        const since = new Date(Date.now() - 3600_000);
        const rows = await db.select({
          platform: appCrashLogs.platform, type: appCrashLogs.crashType,
        }).from(appCrashLogs).where(gte(appCrashLogs.reportedAt, since)).limit(500);
        const agg = new Map<string, number>();
        for (const r of rows) {
          const k = `${r.platform ?? "unknown"}|${r.type ?? "unknown"}`;
          agg.set(k, (agg.get(k) ?? 0) + 1);
        }
        return Array.from(agg.entries()).map(([k, n]) => {
          const [platform, type] = k.split("|");
          return { platform, type, count: n };
        }).sort((a, b) => b.count - a.count);
      },
    }),
  } as const;
}

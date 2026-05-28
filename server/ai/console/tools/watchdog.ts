// Task #2637 — Tool wrappers per lo scope "watchdog" della AI Console.
import { tool } from "ai";
import { z } from "zod";
import { desc, gte, and, eq, sql } from "drizzle-orm";
import { db } from "../../../db";
import {
  systemSignals,
  systemHealthSnapshot,
  aiWatchdogLog,
  appCrashLogs,
} from "@shared/db";
import { getLatestSnapshot, getRecentSnapshots } from "../../watchdog/aggregator";

const since = (ms: number) => new Date(Date.now() - ms);

export const watchdogTools = {
  watchdogHealthNow: tool({
    description: "Snapshot corrente di salute sistema (score, status, problems attivi).",
    inputSchema: z.object({}),
    execute: async () => {
      const live = getLatestSnapshot();
      if (live) return live;
      const [row] = await db.select().from(systemHealthSnapshot)
        .orderBy(desc(systemHealthSnapshot.createdAt)).limit(1);
      return row ?? { error: "nessuno snapshot disponibile" };
    },
  }),

  watchdogHealthTrend: tool({
    description: "Ultimi N snapshot health (default 30).",
    inputSchema: z.object({ limit: z.number().int().min(1).max(200).default(30) }),
    execute: async ({ limit }) => {
      try {
        return await getRecentSnapshots(limit);
      } catch {
        const rows = await db.select().from(systemHealthSnapshot)
          .orderBy(desc(systemHealthSnapshot.createdAt)).limit(limit);
        return rows;
      }
    },
  }),

  watchdogRecentSignals: tool({
    description: "Segnali raw raccolti dai collector negli ultimi N minuti.",
    inputSchema: z.object({
      minutes: z.number().int().min(1).max(1440).default(60),
      source: z.string().optional(),
      severity: z.string().optional(),
      limit: z.number().int().min(1).max(500).default(100),
    }),
    execute: async ({ minutes, source, severity, limit }) => {
      const conds = [gte(systemSignals.createdAt, since(minutes * 60_000))];
      if (source) conds.push(eq(systemSignals.source, source));
      if (severity) conds.push(eq(systemSignals.severity, severity));
      const rows = await db.select({
        id: systemSignals.id, source: systemSignals.source,
        metric: systemSignals.metric, value: systemSignals.value,
        unit: systemSignals.unit, severity: systemSignals.severity,
        createdAt: systemSignals.createdAt,
      }).from(systemSignals).where(and(...conds))
        .orderBy(desc(systemSignals.createdAt)).limit(limit);
      return rows;
    },
  }),

  watchdogRecentLogs: tool({
    description: "Log delle azioni watchdog (auto-fix, proposte, alert, chat). Filtrabile per kind/status.",
    inputSchema: z.object({
      hours: z.number().int().min(1).max(168).default(24),
      kind: z.string().optional(),
      status: z.string().optional(),
      limit: z.number().int().min(1).max(200).default(50),
    }),
    execute: async ({ hours, kind, status, limit }) => {
      const conds = [gte(aiWatchdogLog.createdAt, since(hours * 3600_000))];
      if (kind) conds.push(eq(aiWatchdogLog.kind, kind));
      if (status) conds.push(eq(aiWatchdogLog.status, status));
      const rows = await db.select().from(aiWatchdogLog)
        .where(and(...conds)).orderBy(desc(aiWatchdogLog.createdAt)).limit(limit);
      return rows;
    },
  }),

  watchdogPendingProposals: tool({
    description: "Proposte AI watchdog pending (action queue watchdog).",
    inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(30) }),
    execute: async ({ limit }) => {
      const rows = await db.select().from(aiWatchdogLog)
        .where(and(
          eq(aiWatchdogLog.kind, "proposal"),
          eq(aiWatchdogLog.status, "pending"),
        ))
        .orderBy(desc(aiWatchdogLog.createdAt)).limit(limit);
      return rows;
    },
  }),

  watchdogRecentCrashes: tool({
    description: "Crash client aggregati nelle ultime N ore.",
    inputSchema: z.object({ hours: z.number().int().min(1).max(168).default(1) }),
    execute: async ({ hours }) => {
      const rows = await db.select({
        id: appCrashLogs.id, crashType: appCrashLogs.crashType,
        platform: appCrashLogs.platform, appVersion: appCrashLogs.appVersion,
        errorMessage: appCrashLogs.errorMessage, reportedAt: appCrashLogs.reportedAt,
      }).from(appCrashLogs)
        .where(gte(appCrashLogs.reportedAt, since(hours * 3600_000)))
        .orderBy(desc(appCrashLogs.reportedAt)).limit(100);
      const byType = new Map<string, number>();
      for (const r of rows) {
        const k = `${r.platform ?? "?"}:${(r.errorMessage ?? r.crashType ?? "unknown").slice(0, 80)}`;
        byType.set(k, (byType.get(k) ?? 0) + 1);
      }
      return {
        total: rows.length,
        byType: Array.from(byType.entries())
          .map(([k, n]) => ({ key: k, count: n }))
          .sort((a, b) => b.count - a.count).slice(0, 20),
      };
    },
  }),

  watchdogSearchLogs: tool({
    description: "Ricerca testuale nei log watchdog (summary).",
    inputSchema: z.object({
      query: z.string().min(2).max(120),
      sinceHours: z.number().int().min(1).max(720).default(168),
      limit: z.number().int().min(1).max(100).default(30),
    }),
    execute: async ({ query, sinceHours, limit }) => {
      const rows = await db.select({
        id: aiWatchdogLog.id, kind: aiWatchdogLog.kind, scope: aiWatchdogLog.scope,
        status: aiWatchdogLog.status, summary: aiWatchdogLog.summary,
        createdAt: aiWatchdogLog.createdAt,
      }).from(aiWatchdogLog)
        .where(and(
          gte(aiWatchdogLog.createdAt, since(sinceHours * 3600_000)),
          sql`${aiWatchdogLog.summary} ILIKE ${"%" + query + "%"}`,
        ))
        .orderBy(desc(aiWatchdogLog.createdAt)).limit(limit);
      return rows;
    },
  }),
};

export type WatchdogToolName = keyof typeof watchdogTools;

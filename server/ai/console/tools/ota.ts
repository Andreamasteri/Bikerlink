// Task #2637 — Tool wrappers per lo scope "ota" della AI Console.
import { tool } from "ai";
import { z } from "zod";
import { desc, gte, and, sql } from "drizzle-orm";
import { db } from "../../../db";
import {
  otaReleases,
  otaBootEvents,
  otaAssistantRuns,
  otaWatchdogReports,
} from "@shared/db";

const since = (ms: number) => new Date(Date.now() - ms);

export const otaTools = {
  otaRecentReleases: tool({
    description: "Ultime release OTA pubblicate.",
    inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(10) }),
    execute: async ({ limit }) => {
      const rows = await db.select().from(otaReleases)
        .orderBy(desc(otaReleases.createdAt)).limit(limit);
      return rows;
    },
  }),

  otaBootEventsRecent: tool({
    description: "Eventi di boot OTA (download/apply/error) nelle ultime N ore.",
    inputSchema: z.object({
      hours: z.number().int().min(1).max(168).default(24),
      limit: z.number().int().min(1).max(500).default(100),
    }),
    execute: async ({ hours, limit }) => {
      const rows = await db.select().from(otaBootEvents)
        .where(gte(otaBootEvents.createdAt, since(hours * 3600_000)))
        .orderBy(desc(otaBootEvents.createdAt)).limit(limit);
      const errors = rows.filter((r) => (r.eventType ?? "").toLowerCase().includes("error")).length;
      return { total: rows.length, errors, sample: rows.slice(0, 20) };
    },
  }),

  otaAssistantRunsRecent: tool({
    description: "Ultime esecuzioni dell'OTA Assistant (LLM analysis).",
    inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(10) }),
    execute: async ({ limit }) => {
      const rows = await db.select({
        id: otaAssistantRuns.id, adminId: otaAssistantRuns.adminId,
        status: otaAssistantRuns.status, prompt: otaAssistantRuns.prompt,
        startedAt: otaAssistantRuns.startedAt,
      }).from(otaAssistantRuns)
        .orderBy(desc(otaAssistantRuns.startedAt)).limit(limit);
      return rows.map((r) => ({
        ...r, prompt: (r.prompt ?? "").slice(0, 200),
      }));
    },
  }),

  otaWatchdogReports: tool({
    description: "Report periodici dell'OTA watchdog (candidate count, threshold).",
    inputSchema: z.object({
      hours: z.number().int().min(1).max(720).default(168),
      limit: z.number().int().min(1).max(50).default(20),
    }),
    execute: async ({ hours, limit }) => {
      const rows = await db.select().from(otaWatchdogReports)
        .where(gte(otaWatchdogReports.generatedAt, since(hours * 3600_000)))
        .orderBy(desc(otaWatchdogReports.generatedAt)).limit(limit);
      return rows;
    },
  }),

  otaPendingAssistantRuns: tool({
    description: "Run OTA assistant in stato pending/failed (action queue OTA).",
    inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(20) }),
    execute: async ({ limit }) => {
      const rows = await db.select().from(otaAssistantRuns)
        .where(and(
          sql`${otaAssistantRuns.status} IN ('pending','failed','error')`,
        ))
        .orderBy(desc(otaAssistantRuns.startedAt)).limit(limit);
      return rows;
    },
  }),

  otaSearchAssistantLogs: tool({
    description: "Ricerca testuale full-text nei prompt/response dell'OTA Assistant.",
    inputSchema: z.object({
      query: z.string().min(2).max(120),
      sinceHours: z.number().int().min(1).max(720).default(168),
      limit: z.number().int().min(1).max(50).default(20),
    }),
    execute: async ({ query, sinceHours, limit }) => {
      const rows = await db.select({
        id: otaAssistantRuns.id, status: otaAssistantRuns.status,
        prompt: otaAssistantRuns.prompt, startedAt: otaAssistantRuns.startedAt,
      }).from(otaAssistantRuns)
        .where(and(
          gte(otaAssistantRuns.startedAt, since(sinceHours * 3600_000)),
          sql`(${otaAssistantRuns.prompt} ILIKE ${"%" + query + "%"} OR ${otaAssistantRuns.response} ILIKE ${"%" + query + "%"})`,
        ))
        .orderBy(desc(otaAssistantRuns.startedAt)).limit(limit);
      return rows.map((r) => ({ ...r, prompt: (r.prompt ?? "").slice(0, 200) }));
    },
  }),
};

export type OtaToolName = keyof typeof otaTools;

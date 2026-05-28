// Task #2637 — Tool wrappers per gli scope "db-integrity" e "app-integrity".
import { tool } from "ai";
import { z } from "zod";
import { desc, gte, and, eq, sql } from "drizzle-orm";
import { db } from "../../../db";
import {
  dbIntegrityRuns,
  dbIntegrityViolations,
  integrityRuns,
  integrityViolations,
} from "@shared/db";
import { getLatestRunSummary as getLatestDbIntegrityRun, listOpenViolations as listOpenDbViolations } from "../../db-integrity/runner";
import { getLatestRunSummary as getLatestAppIntegrityRun, listOpenViolations as listOpenAppViolations } from "../../integrity/runner";

const since = (ms: number) => new Date(Date.now() - ms);

export const integrityTools = {
  // ─── DB integrity ─────────────────────────────────────────────────────
  dbIntegrityLatestRun: tool({
    description: "Summary dell'ultimo scan DB integrity (checks/violazioni/auto-fixed).",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        return (await getLatestDbIntegrityRun()) ?? { error: "nessun run" };
      } catch {
        const [r] = await db.select().from(dbIntegrityRuns)
          .orderBy(desc(dbIntegrityRuns.runAt)).limit(1);
        return r ?? { error: "nessun run" };
      }
    },
  }),

  dbIntegrityOpenViolations: tool({
    description: "Violazioni DB integrity ancora aperte (orphan rows, stati invalidi).",
    inputSchema: z.object({ limit: z.number().int().min(1).max(500).default(100) }),
    execute: async ({ limit }) => {
      try {
        return await listOpenDbViolations(limit);
      } catch {
        const rows = await db.select().from(dbIntegrityViolations)
          .where(eq(dbIntegrityViolations.status, "open"))
          .orderBy(desc(dbIntegrityViolations.createdAt)).limit(limit);
        return rows;
      }
    },
  }),

  dbIntegrityRecentRuns: tool({
    description: "Ultimi N run DB integrity.",
    inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(10) }),
    execute: async ({ limit }) => {
      const rows = await db.select().from(dbIntegrityRuns)
        .orderBy(desc(dbIntegrityRuns.runAt)).limit(limit);
      return rows;
    },
  }),

  // ─── App / code integrity ─────────────────────────────────────────────
  appIntegrityLatestRun: tool({
    description: "Summary dell'ultimo scan app/code integrity.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        return (await getLatestAppIntegrityRun()) ?? { error: "nessun run" };
      } catch {
        const [r] = await db.select().from(integrityRuns)
          .orderBy(desc(integrityRuns.runAt)).limit(1);
        return r ?? { error: "nessun run" };
      }
    },
  }),

  appIntegrityOpenViolations: tool({
    description: "Violazioni app/code integrity ancora aperte.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(500).default(100),
      family: z.string().optional(),
    }),
    execute: async ({ limit, family }) => {
      try {
        return await listOpenAppViolations(limit, family as never);
      } catch {
        const conds = [eq(integrityViolations.status, "open")];
        const rows = await db.select().from(integrityViolations)
          .where(and(...conds))
          .orderBy(desc(integrityViolations.createdAt)).limit(limit);
        return rows;
      }
    },
  }),

  integrityViolationsSince: tool({
    description: "Tutte le violazioni (DB + App) create dopo `sinceHours` ore fa.",
    inputSchema: z.object({
      sinceHours: z.number().int().min(1).max(720).default(24),
      limit: z.number().int().min(1).max(500).default(100),
    }),
    execute: async ({ sinceHours, limit }) => {
      const cutoff = since(sinceHours * 3600_000);
      const [dbRows, appRows] = await Promise.all([
        db.select({
          id: dbIntegrityViolations.id, scope: sql<string>`'db'`,
          checkId: dbIntegrityViolations.checkId, severity: dbIntegrityViolations.severity,
          status: dbIntegrityViolations.status, count: dbIntegrityViolations.count,
          createdAt: dbIntegrityViolations.createdAt,
        }).from(dbIntegrityViolations)
          .where(gte(dbIntegrityViolations.createdAt, cutoff))
          .orderBy(desc(dbIntegrityViolations.createdAt)).limit(limit),
        db.select({
          id: integrityViolations.id, scope: sql<string>`'app'`,
          checkId: integrityViolations.checkId, severity: integrityViolations.severity,
          status: integrityViolations.status, count: sql<number>`1`,
          createdAt: integrityViolations.createdAt,
        }).from(integrityViolations)
          .where(gte(integrityViolations.createdAt, cutoff))
          .orderBy(desc(integrityViolations.createdAt)).limit(limit),
      ]);
      return [...dbRows, ...appRows]
        .sort((a, b) => {
          const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
          const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
          return tb - ta;
        }).slice(0, limit);
    },
  }),
};

export type IntegrityToolName = keyof typeof integrityTools;

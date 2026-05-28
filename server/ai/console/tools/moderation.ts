// Task #2637 — Tool wrappers per lo scope "moderation" della AI Console.
// Tutti read-only: NESSUNA decisione autonoma (ban/dismiss) → solo lettura.
import { tool } from "ai";
import { z } from "zod";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../../../db";
import {
  reports,
  aiSuggestionsLog,
  anomalyEvents,
  moderatorLogs,
} from "@shared/db";
import { redactPII, redactObject } from "../../moderation/redact";

const since = (ms: number) => new Date(Date.now() - ms);

export const moderationTools = {
  moderationGetReport: tool({
    description: "Recupera dati di un report (PII mascherati).",
    inputSchema: z.object({ id: z.string().min(1) }),
    execute: async ({ id }) => {
      const [r] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
      if (!r) return { error: "report non trovato" };
      return redactObject({
        id: r.id, status: r.status, severity: r.severity, category: r.category,
        context: r.context, contextId: r.contextId, reason: r.reason,
        description: r.description, reportedUserId: r.reportedUserId,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      });
    },
  }),

  moderationListRecentReports: tool({
    description: "Ultimi report ricevuti (default 20, finestra default 24h).",
    inputSchema: z.object({
      hours: z.number().int().min(1).max(168).default(24),
      limit: z.number().int().min(1).max(100).default(20),
      status: z.string().optional(),
    }),
    execute: async ({ hours, limit, status }) => {
      const conds = [gte(reports.createdAt, since(hours * 3600_000))];
      if (status) conds.push(eq(reports.status, status));
      const rows = await db.select({
        id: reports.id, category: reports.category, severity: reports.severity,
        status: reports.status, reportedUserId: reports.reportedUserId,
        reason: reports.reason, createdAt: reports.createdAt,
      }).from(reports).where(and(...conds)).orderBy(desc(reports.createdAt)).limit(limit);
      return rows.map((r) => ({
        id: r.id, category: r.category, severity: r.severity, status: r.status,
        userId: r.reportedUserId,
        reason: redactPII(r.reason ?? "").slice(0, 140),
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      }));
    },
  }),

  moderationUserHistory: tool({
    description: "Ultimi 20 report ricevuti da un utente.",
    inputSchema: z.object({ userId: z.string().min(1) }),
    execute: async ({ userId }) => {
      const rows = await db.select({
        id: reports.id, category: reports.category, severity: reports.severity,
        status: reports.status, createdAt: reports.createdAt, reason: reports.reason,
      }).from(reports).where(eq(reports.reportedUserId, userId))
        .orderBy(desc(reports.createdAt)).limit(20);
      return rows.map((r) => ({
        id: r.id, category: r.category, severity: r.severity, status: r.status,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        reason: redactPII(r.reason ?? "").slice(0, 120),
      }));
    },
  }),

  moderationRecentAnomalies: tool({
    description: "Eventi di anomalia rilevati negli ultimi N giorni.",
    inputSchema: z.object({ days: z.number().int().min(1).max(30).default(7) }),
    execute: async ({ days }) => {
      const rows = await db.select().from(anomalyEvents)
        .where(gte(anomalyEvents.createdAt, since(days * 86400_000)))
        .orderBy(desc(anomalyEvents.createdAt)).limit(50);
      return rows.map((a) => ({
        id: a.id, type: a.type, category: a.category, observed: a.observed,
        threshold: a.threshold,
        createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
      }));
    },
  }),

  moderationRecentDecisions: tool({
    description: "Ultime decisioni dei moderatori (audit log).",
    inputSchema: z.object({
      hours: z.number().int().min(1).max(168).default(24),
      limit: z.number().int().min(1).max(100).default(20),
    }),
    execute: async ({ hours, limit }) => {
      const rows = await db.select({
        id: moderatorLogs.id, action: moderatorLogs.action,
        moderatorId: moderatorLogs.moderatorId, targetType: moderatorLogs.targetType,
        targetId: moderatorLogs.targetId, createdAt: moderatorLogs.createdAt,
      }).from(moderatorLogs)
        .where(gte(moderatorLogs.createdAt, since(hours * 3600_000)))
        .orderBy(desc(moderatorLogs.createdAt)).limit(limit);
      return rows.map((m) => ({
        id: m.id, action: m.action,
        target: `${m.targetType}:${m.targetId}`,
        moderatorId: m.moderatorId,
        createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
      }));
    },
  }),

  moderationPendingAiSuggestions: tool({
    description: "Suggerimenti AI non ancora applicati né rifiutati (action queue moderazione).",
    inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(30) }),
    execute: async ({ limit }) => {
      const rows = await db.select({
        id: aiSuggestionsLog.id, scope: aiSuggestionsLog.scope,
        reportId: aiSuggestionsLog.reportId, userId: aiSuggestionsLog.userId,
        suggestion: aiSuggestionsLog.suggestion, createdAt: aiSuggestionsLog.createdAt,
      }).from(aiSuggestionsLog)
        .where(and(
          eq(aiSuggestionsLog.scope, "action_draft"),
          sql`${aiSuggestionsLog.acceptedAt} IS NULL`,
          sql`${aiSuggestionsLog.rejectedAt} IS NULL`,
        ))
        .orderBy(desc(aiSuggestionsLog.createdAt)).limit(limit);
      return rows;
    },
  }),
};

export type ModerationToolName = keyof typeof moderationTools;

// Task #2532 — Chat copilot endpoint. Streaming via streamText + tool calling.
// Tutti i tool sono read-only o "draft" (mai esecuzioni). PII redacted.
import { streamText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { db } from "../../db";
import { reports, users, moderatorLogs } from "@shared/db";
import { eq, and, desc, ne, sql, gte, count, avg } from "drizzle-orm";
import { runWithFallback, estimateCostUsd } from "./provider";
import { redactPII, redactObject } from "./redact";
import { withBudget } from "./budget";
import { logAiCall } from "./log";
import type { AiCallMeta } from "./types";

const SYSTEM_PROMPT = `Sei il Co-Pilot AI di moderazione di BikerLink. Lavori per il moderatore umano.
REGOLE INDEROGABILI:
1. Non eseguire MAI azioni autonome (ban, dismiss, modifiche utenti). I tuoi tool "draftBanAction" e "draftDismissReport" producono SOLO una bozza che l'admin dovrà cliccare "Applica".
2. NON hai accesso a chat private 1:1 degli utenti (privacy).
3. Usa i tool per leggere dati prima di rispondere. Se servono più info, chiamali in sequenza.
4. Rispondi in italiano, conciso. Usa elenchi puntati per multi-step.
5. Se rilevi un pattern (es. molti report dallo stesso reporter), evidenzialo.
6. Spiega sempre la motivazione di un draft. Non proporre ban senza prove dal contesto.
7. Output finale: testo conversazionale, eventualmente con uno o più tool draft come allegati.`;

const SCOPE_PREFIX: Record<string, string> = {
  report: "Stai analizzando un REPORT specifico",
  user: "Stai analizzando un UTENTE specifico",
  pattern: "Stai analizzando un PATTERN di segnalazioni",
  free: "Conversazione libera con il moderatore",
};

export interface ChatStreamOpts {
  scope: "report" | "user" | "pattern" | "free";
  contextId?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  moderatorId: string;
  onFinish?: (meta: AiCallMeta, finalText: string, drafts: unknown[]) => void;
}

function buildTools(opts: { moderatorId: string; contextReportId?: string }) {
  // Log immediato dei draft → ritorna suggestionLogId per consentire apply/track audit.
  const logDraft = async (kind: "draft_ban" | "draft_dismiss", suggestion: object, reportId?: string) => {
    const id = await logAiCall({
      scope: "action_draft",
      userId: opts.moderatorId,
      reportId: reportId ?? opts.contextReportId ?? null,
      suggestion,
      // cost reale loggato a parte in onFinish (chat). Qui è solo audit del draft.
      meta: { provider: "n/a", model: "draft", tokensIn: 0, tokensOut: 0, costUsd: 0, durationMs: 0 },
    });
    return id;
  };
  return {
    getReport: tool({
      description: "Recupera dati completi di un report (PII mascherati). Usa per leggere descrizione, categoria, severity, contesto.",
      inputSchema: z.object({ id: z.string().min(1) }),
      execute: async ({ id }) => {
        const [r] = await db.select().from(reports).where(eq(reports.id, id));
        if (!r) return { error: "report non trovato" };
        return redactObject({
          id: r.id, status: r.status, severity: r.severity, category: r.category,
          context: r.context, contextId: r.contextId,
          reason: r.reason, description: r.description,
          reportedUserId: r.reportedUserId, reporterTrustScore: r.reporterTrustScore,
          affectedFeedbackLoop: r.affectedFeedbackLoop,
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
          aiAnalysis: r.aiAnalysis,
        });
      },
    }),
    getUserHistory: tool({
      description: "Storico report ricevuti da un utente (ultimi 20). Per capire se è recidivo.",
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
          reason: redactPII(r.reason).slice(0, 120),
        }));
      },
    }),
    getReporterHistory: tool({
      description: "Storico report INVIATI da un utente (per individuare reporter abusivo / retaliatorio).",
      inputSchema: z.object({ userId: z.string().min(1) }),
      execute: async ({ userId }) => {
        const rows = await db.select({
          id: reports.id, reportedUserId: reports.reportedUserId,
          category: reports.category, severity: reports.severity,
          createdAt: reports.createdAt,
        }).from(reports).where(eq(reports.reporterId, userId))
          .orderBy(desc(reports.createdAt)).limit(20);
        return rows.map((r) => ({
          id: r.id, vs: r.reportedUserId.slice(0, 12), category: r.category, severity: r.severity,
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        }));
      },
    }),
    getUserProfile: tool({
      description: "Profilo pubblico (nickname, ruolo, status, ban precedenti). Mai email/telefono/posizione.",
      inputSchema: z.object({ userId: z.string().min(1) }),
      execute: async ({ userId }) => {
        const [u] = await db.select({
          id: users.id, nickname: users.nickname, userType: users.userType,
          role: users.role, status: users.status,
        }).from(users).where(eq(users.id, userId));
        if (!u) return { error: "utente non trovato" };
        return u;
      },
    }),
    getSimilarReports: tool({
      description: "Report simili (stessa categoria) verso lo stesso utente. Per identificare pattern.",
      inputSchema: z.object({ reportId: z.string().min(1) }),
      execute: async ({ reportId }) => {
        const [r] = await db.select().from(reports).where(eq(reports.id, reportId));
        if (!r) return { error: "report non trovato" };
        const sims = await db.select({
          id: reports.id, severity: reports.severity, status: reports.status,
          createdAt: reports.createdAt,
        }).from(reports).where(and(
          eq(reports.reportedUserId, r.reportedUserId),
          eq(reports.category, r.category ?? "other"),
          ne(reports.id, reportId),
        )).orderBy(desc(reports.createdAt)).limit(10);
        return sims.map((s) => ({
          ...s, createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
        }));
      },
    }),
    getUserBanHistory: tool({
      description: "Storico ban/sospensioni precedenti applicate a un utente (dai log moderatori). Per capire se è recidivo o se è già stato graziato.",
      inputSchema: z.object({ userId: z.string().min(1) }),
      execute: async ({ userId }) => {
        const rows = await db.select({
          action: moderatorLogs.action,
          details: moderatorLogs.details,
          createdAt: moderatorLogs.createdAt,
        }).from(moderatorLogs).where(and(
          eq(moderatorLogs.targetType, "user"),
          eq(moderatorLogs.targetId, userId),
        )).orderBy(desc(moderatorLogs.createdAt)).limit(20);
        const [u] = await db.select({
          status: users.status,
          suspendedUntil: users.suspendedUntil,
        }).from(users).where(eq(users.id, userId));
        return {
          currentStatus: u?.status ?? null,
          suspendedUntil: u?.suspendedUntil instanceof Date ? u.suspendedUntil.toISOString() : u?.suspendedUntil ?? null,
          history: rows.map((r) => ({
            action: r.action,
            createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
            details: (r.details ?? "").slice(0, 150),
          })),
        };
      },
    }),
    getUserTrustAggregate: tool({
      description: "Aggregati di affidabilità di un utente: trust score medio come reporter (ultimi 90g), totale report ricevuti/inviati. Utile per pesare la credibilità.",
      inputSchema: z.object({ userId: z.string().min(1) }),
      execute: async ({ userId }) => {
        const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const [received] = await db.select({ c: count() }).from(reports).where(eq(reports.reportedUserId, userId));
        const [sent] = await db.select({ c: count() }).from(reports).where(eq(reports.reporterId, userId));
        const [trust] = await db.select({ avgTrust: avg(reports.reporterTrustScore) })
          .from(reports)
          .where(and(eq(reports.reporterId, userId), gte(reports.createdAt, since)));
        const [resolvedRatio] = await db.select({
          total: count(),
          resolved: sql<number>`SUM(CASE WHEN ${reports.status} = 'resolved' THEN 1 ELSE 0 END)`,
        }).from(reports).where(eq(reports.reportedUserId, userId));
        return {
          totalReceived: Number(received?.c ?? 0),
          totalSent: Number(sent?.c ?? 0),
          avgTrustAsReporter90d: trust?.avgTrust ? Number(trust.avgTrust) : null,
          resolvedAgainstUser: Number(resolvedRatio?.resolved ?? 0),
          totalAgainstUser: Number(resolvedRatio?.total ?? 0),
        };
      },
    }),
    draftBanAction: tool({
      description: "PRODUCE SOLO UNA BOZZA di ban. Non esegue nulla. L'admin deve cliccare 'Applica' nell'UI.",
      inputSchema: z.object({
        userId: z.string().min(1),
        durationDays: z.number().int().min(0).max(365).describe("0 = permanente"),
        reason: z.string().min(10).max(500),
      }),
      execute: async ({ userId, durationDays, reason }) => {
        const draft = { kind: "draft_ban" as const, userId, durationDays, reason };
        const suggestionLogId = await logDraft("draft_ban", draft);
        return {
          ...draft, suggestionLogId,
          notice: "Bozza generata. L'admin deve confermare cliccando 'Applica'.",
        };
      },
    }),
    draftDismissReport: tool({
      description: "PRODUCE SOLO UNA BOZZA di dismiss/archiviazione del report. Non esegue.",
      inputSchema: z.object({
        reportId: z.string().min(1),
        reason: z.string().min(5).max(300),
      }),
      execute: async ({ reportId, reason }) => {
        const draft = { kind: "draft_dismiss" as const, reportId, reason };
        const suggestionLogId = await logDraft("draft_dismiss", draft, reportId);
        return {
          ...draft, suggestionLogId,
          notice: "Bozza generata. L'admin deve confermare cliccando 'Applica'.",
        };
      },
    }),
  } as const;
}

export async function streamChat(opts: ChatStreamOpts) {
  return withBudget("chat", async () => {
    const ctxLine = opts.contextId
      ? `${SCOPE_PREFIX[opts.scope]} (id=${opts.contextId}).`
      : SCOPE_PREFIX[opts.scope];
    // Sanitize ogni messaggio utente.
    const safeMessages = opts.messages.map((msg) => ({
      role: msg.role,
      content: msg.role === "user" ? redactPII(msg.content) : msg.content,
    }));
    const started = Date.now();
    const tools = buildTools({
      moderatorId: opts.moderatorId,
      contextReportId: opts.scope === "report" ? opts.contextId : undefined,
    });
    // Per-request fallback: se il provider primario errora in fase di setup stream,
    // il prossimo provider della chain viene provato all'interno della stessa request.
    // Task #3872 — skipOllama: true: il co-pilot usa tool calling multi-step (max 6
    // step). Ollama con tool calling multi-step è inaffidabile su modelli locali 8B
    // (allucinazioni nei function call, schema JSON non rispettato). Si mantiene
    // cloud-only per garantire qualità e sicurezza delle azioni suggerite all'admin.
    const { value: result, model: m } = await runWithFallback({ role: "brain", skipOllama: true }, async (mm) => {
      return streamText({
        model: mm.model,
        system: `${SYSTEM_PROMPT}\n\nCONTESTO: ${ctxLine}`,
        messages: safeMessages,
        tools,
        stopWhen: stepCountIs(6),
        temperature: 0.3,
        onFinish: async (ev) => {
          const tokensIn = ev.usage?.inputTokens ?? 0;
          const tokensOut = ev.usage?.outputTokens ?? 0;
          const meta: AiCallMeta = {
            provider: mm.providerName, model: mm.modelId, tokensIn, tokensOut,
            costUsd: estimateCostUsd(mm.modelId, tokensIn, tokensOut),
            durationMs: Date.now() - started,
          };
          const drafts = (ev.toolResults ?? []).map((tr) => tr.output).filter((o) => {
            const out = o as { kind?: string } | undefined;
            return out?.kind === "draft_ban" || out?.kind === "draft_dismiss";
          });
          // Nota: i singoli draft sono già loggati con suggestionLogId in buildTools.
          // Qui logghiamo il turn della chat (testo + costo reale).
          await logAiCall({
            scope: "chat",
            userId: opts.moderatorId,
            reportId: opts.scope === "report" ? opts.contextId ?? null : null,
            prompt: safeMessages.map((mmsg) => `${mmsg.role}: ${mmsg.content}`).join("\n").slice(0, 4000),
            response: (ev.text ?? "").slice(0, 4000),
            suggestion: null,
            meta,
          });
          opts.onFinish?.(meta, ev.text ?? "", drafts);
        },
      });
    });
    return { result, model: m };
  });
}

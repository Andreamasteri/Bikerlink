// Task #2532 — Endpoint admin Co-Pilot AI moderazione.
import { Router, type Request, type Response } from "express";
import { sendError } from "../../lib/api-response";
import { db } from "../../db";
import { reports, aiSuggestionsLog, anomalyEvents } from "@shared/db";
import { and, eq, gte, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { streamChat } from "../../ai/moderation/chat";
import { runTriage } from "../../ai/moderation/triage";
import { enqueueTriage, getQueueStats } from "../../ai/moderation/queue";
import { getBudgetStatus, setBudgetLimit } from "../../ai/moderation/budget";
import { getProviderHealth, hasAnyAiProvider, AI_NO_PROVIDER_MESSAGE, getGroqTpdStatus } from "../../ai/moderation/provider";
import { setGroqTpdSoftCap } from "../../ai/groq-quota";
import { runAnomalyScan } from "../../ai/moderation/anomalies";
import { runDigestForAll, getLatestDigestWithReadState, markDigestRead, hasUnreadDigest } from "../../ai/moderation/digest";
import { storage } from "../../storage";

const router = Router();

// ─── Chat copilot (streaming SSE) ────────────────────────────────────────────
const chatSchema = z.object({
  scope: z.enum(["report", "user", "pattern", "free"]),
  contextId: z.string().optional(),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000),
  })).min(1).max(40),
});

router.post("/ai/chat", async (req: Request, res: Response) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
  const modId = req.session?.userId as string | undefined;
  if (!modId) return sendError(res, 401, "Sessione scaduta");

  // Task #2825 — Nessun provider AI configurato: 503 + var mancanti prima di aprire l'SSE.
  if (!hasAnyAiProvider()) return sendError(res, 503, AI_NO_PROVIDER_MESSAGE);

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  try {
    const { result } = await streamChat({
      scope: parsed.data.scope,
      contextId: parsed.data.contextId,
      messages: parsed.data.messages,
      moderatorId: modId,
    });
    for await (const chunk of result.textStream) {
      res.write(`data: ${JSON.stringify({ type: "text", chunk })}\n\n`);
    }
    const final = await result.text;
    const toolResults = await result.toolResults;
    const drafts = (toolResults ?? []).map((tr) => tr.output).filter((o) => {
      const x = o as { kind?: string } | undefined;
      return x?.kind === "draft_ban" || x?.kind === "draft_dismiss";
    });
    res.write(`event: done\ndata: ${JSON.stringify({ final, drafts })}\n\n`);
    res.end();
  } catch (err) {
    const message = (err as Error).message ?? "errore AI";
    const code = message.startsWith("AI_BUDGET_EXCEEDED") ? "budget_exceeded"
      : message.startsWith("AI_PROVIDER_UNAVAILABLE") ? "provider_unavailable"
      : "error";
    res.write(`event: error\ndata: ${JSON.stringify({ code, message })}\n\n`);
    res.end();
  }
});

// ─── Trigger triage on-demand ────────────────────────────────────────────────
router.post("/ai/triage/:reportId", async (req: Request, res: Response) => {
  const reportId = String(req.params.reportId ?? "");
  if (!reportId) return sendError(res, 400, "reportId mancante");
  const force = String(req.query.force ?? "") === "1";
  if (!force) {
    enqueueTriage(reportId);
    return res.json({ queued: true });
  }
  if (!hasAnyAiProvider()) return sendError(res, 503, AI_NO_PROVIDER_MESSAGE);
  const out = await runTriage({ reportId });
  if (!out) return sendError(res, 503, "Triage non disponibile (budget/provider)");
  return res.json({ analysis: out });
});

// ─── Apply draft (ban / dismiss) — l'admin clicca 'Applica' ──────────────────
const applyBanSchema = z.object({ userId: z.string().min(1), durationDays: z.number().int().min(0).max(365), reason: z.string().min(5).max(500), suggestionLogId: z.string().optional() });
const applyDismissSchema = z.object({ reportId: z.string().min(1), reason: z.string().min(3).max(300), suggestionLogId: z.string().optional() });

router.post("/ai/apply/ban", async (req: Request, res: Response) => {
  const parsed = applyBanSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
  const modId = req.session?.userId as string | undefined;
  if (!modId) return sendError(res, 401, "Sessione scaduta");
  try {
    const { userId, durationDays, reason, suggestionLogId } = parsed.data;
    // Ban via update status. durationDays=0 ⇒ blocked permanente; >0 ⇒ suspended con
    // suspendedUntil = NOW + durationDays. L'unban-scheduler in server/index.ts riporta
    // lo status a "active" quando suspendedUntil scade.
    const suspendedUntil = durationDays > 0 ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000) : null;
    await storage.updateUser(userId, {
      status: durationDays === 0 ? "blocked" : "suspended",
      suspendedUntil,
    });
    await storage.createModeratorLog({
      moderatorId: modId, action: durationDays === 0 ? "ai_assisted_ban_perm" : "ai_assisted_ban_temp",
      targetType: "user", targetId: userId,
      details: `days=${durationDays} reason="${reason.slice(0, 200)}" via=ai_copilot`,
    }).catch(() => {});
    if (suggestionLogId) {
      await db.update(aiSuggestionsLog)
        .set({ acceptedByAdminId: modId, acceptedAt: new Date() })
        .where(eq(aiSuggestionsLog.id, suggestionLogId));
    }
    // Task #2654 — emit Coordinator (graceful)
    try {
      const { emitConsoleOverride } = await import("../../ai/coordinator/integrations/console");
      await emitConsoleOverride({
        adminId: modId, target: `user:${userId}`,
        rationale: `apply_ban days=${durationDays} reason=${reason.slice(0, 200)}`,
        correlationId: suggestionLogId ? `sugg-${suggestionLogId.slice(0, 12)}` : undefined,
      });
    } catch (e) { console.warn("[ai/apply/ban] emit coordinator:", (e as Error).message); }
    return res.json({ ok: true });
  } catch (err) {
    console.error("[ai/apply/ban] error:", err);
    return sendError(res, 500, "Errore applicazione ban");
  }
});

router.post("/ai/apply/dismiss", async (req: Request, res: Response) => {
  const parsed = applyDismissSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
  const modId = req.session?.userId as string | undefined;
  if (!modId) return sendError(res, 401, "Sessione scaduta");
  try {
    const { reportId, reason, suggestionLogId } = parsed.data;
    await storage.resolveReport(reportId, { status: "dismissed", resolvedBy: modId });
    await storage.createModeratorLog({
      moderatorId: modId, action: "ai_assisted_dismiss",
      targetType: "report", targetId: reportId,
      details: `reason="${reason.slice(0, 200)}" via=ai_copilot`,
    }).catch(() => {});
    if (suggestionLogId) {
      await db.update(aiSuggestionsLog)
        .set({ acceptedByAdminId: modId, acceptedAt: new Date() })
        .where(eq(aiSuggestionsLog.id, suggestionLogId));
    }
    // Task #2654 — emit Coordinator (graceful)
    try {
      const { emitConsoleOverride } = await import("../../ai/coordinator/integrations/console");
      await emitConsoleOverride({
        adminId: modId, target: `report:${reportId}`,
        rationale: `apply_dismiss reason=${reason.slice(0, 200)}`,
        correlationId: suggestionLogId ? `sugg-${suggestionLogId.slice(0, 12)}` : undefined,
      });
    } catch (e) { console.warn("[ai/apply/dismiss] emit coordinator:", (e as Error).message); }
    return res.json({ ok: true });
  } catch (err) {
    console.error("[ai/apply/dismiss] error:", err);
    return sendError(res, 500, "Errore applicazione dismiss");
  }
});

// ─── Reject suggerimento (persisti motivazione per audit/quality metrics) ────
const rejectSchema = z.object({ suggestionLogId: z.string().min(1), reason: z.string().min(1).max(300).optional() });
router.post("/ai/reject", async (req: Request, res: Response) => {
  const parsed = rejectSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
  const modId = req.session?.userId as string | undefined;
  if (!modId) return sendError(res, 401, "Sessione scaduta");
  try {
    await db.update(aiSuggestionsLog).set({
      rejectedByAdminId: modId,
      rejectedAt: new Date(),
      rejectReason: parsed.data.reason ?? null,
    }).where(eq(aiSuggestionsLog.id, parsed.data.suggestionLogId));
    // Task #2654 — emit Coordinator (graceful)
    try {
      const { emitConsoleOverride } = await import("../../ai/coordinator/integrations/console");
      await emitConsoleOverride({
        adminId: modId, target: `suggestion:${parsed.data.suggestionLogId}`,
        rationale: `reject_suggestion reason=${(parsed.data.reason ?? "").slice(0, 200)}`,
        correlationId: `sugg-${parsed.data.suggestionLogId.slice(0, 12)}`,
      });
    } catch (e) { console.warn("[ai/reject] emit coordinator:", (e as Error).message); }
    return res.json({ ok: true });
  } catch (err) {
    console.error("[ai/reject] error:", err);
    return sendError(res, 500, "Errore reject");
  }
});

// ─── Stats / health ──────────────────────────────────────────────────────────
router.get("/ai/stats", async (_req: Request, res: Response) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [budget, queue, providers, analyzed24h] = await Promise.all([
      getBudgetStatus(), Promise.resolve(getQueueStats()), Promise.resolve(getProviderHealth()),
      db.select({ id: reports.id }).from(reports).where(gte(reports.aiAnalyzedAt, new Date(Date.now() - 24 * 60 * 60 * 1000))),
    ]);
    const byScope = await db
      .select({
        scope: aiSuggestionsLog.scope,
        n: sql<number>`count(*)::int`,
        cost: sql<number>`coalesce(sum(cost_usd)::float, 0)`,
        accepted: sql<number>`sum(case when accepted_by_admin_id is not null then 1 else 0 end)::int`,
      })
      .from(aiSuggestionsLog)
      .where(gte(aiSuggestionsLog.createdAt, since))
      .groupBy(aiSuggestionsLog.scope);
    const byModel = await db
      .select({
        model: aiSuggestionsLog.model,
        n: sql<number>`count(*)::int`,
        cost: sql<number>`coalesce(sum(cost_usd)::float, 0)`,
      })
      .from(aiSuggestionsLog)
      .where(gte(aiSuggestionsLog.createdAt, since))
      .groupBy(aiSuggestionsLog.model);
    const anomaliesRecent = await db.select().from(anomalyEvents)
      .where(gte(anomalyEvents.createdAt, since))
      .orderBy(desc(anomalyEvents.createdAt)).limit(20);
    return res.json({
      budget, queue, providers,
      analyzed24h: analyzed24h.length,
      byScope, byModel,
      anomaliesRecent: anomaliesRecent.map((a) => ({
        ...a, createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
      })),
      groqTpd: getGroqTpdStatus(),
    });
  } catch (err) {
    console.error("[ai/stats] error:", err);
    return sendError(res, 500, "Errore stats AI");
  }
});

router.get("/ai/settings", async (_req: Request, res: Response) => {
  try {
    const [preferred, sensitivity] = await Promise.all([
      storage.getAppSetting("ai_moderation_preferred_provider"),
      storage.getAppSetting("ai_moderation_anomaly_sigma"),
    ]);
    const budget = await getBudgetStatus();
    const tpd = getGroqTpdStatus();
    return res.json({
      preferredProvider: preferred?.value ?? "auto",
      anomalySigma: sensitivity?.value ? parseFloat(sensitivity.value) : 3,
      budget,
      groqTpdSoftCap: tpd.cap,
    });
  } catch (err) {
    console.error("[ai/settings] error:", err);
    return sendError(res, 500, "Errore lettura settings");
  }
});

const settingsSchema = z.object({
  preferredProvider: z.enum(["auto", "openai", "google", "groq"]).optional(),
  anomalySigma: z.number().min(1).max(6).optional(),
  budgetLimitUsd: z.number().min(0).max(10000).optional(),
  groqTpdSoftCap: z.number().int().min(10000).max(200000).optional(),
});

router.patch("/ai/settings", async (req: Request, res: Response) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
  try {
    if (parsed.data.preferredProvider) {
      await storage.upsertAppSetting("ai_moderation_preferred_provider", parsed.data.preferredProvider);
    }
    if (parsed.data.anomalySigma != null) {
      await storage.upsertAppSetting("ai_moderation_anomaly_sigma", String(parsed.data.anomalySigma));
    }
    if (parsed.data.budgetLimitUsd != null) {
      await setBudgetLimit(parsed.data.budgetLimitUsd);
    }
    if (parsed.data.groqTpdSoftCap != null) {
      await setGroqTpdSoftCap(parsed.data.groqTpdSoftCap);
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error("[ai/settings] patch error:", err);
    return sendError(res, 500, "Errore aggiornamento settings");
  }
});

router.post("/ai/anomaly/scan", async (_req: Request, res: Response) => {
  try {
    if (!hasAnyAiProvider()) return sendError(res, 503, AI_NO_PROVIDER_MESSAGE);
    const out = await runAnomalyScan();
    return res.json(out);
  } catch (err) {
    console.error("[ai/anomaly/scan] error:", err);
    return sendError(res, 500, "Errore scan anomalie");
  }
});

router.post("/ai/digest/run", async (_req: Request, res: Response) => {
  try {
    if (!hasAnyAiProvider()) return sendError(res, 503, AI_NO_PROVIDER_MESSAGE);
    return res.json(await runDigestForAll());
  }
  catch (err) {
    console.error("[ai/digest/run] error:", err);
    return sendError(res, 500, "Errore digest");
  }
});

router.get("/ai/digest/latest", async (req: Request, res: Response) => {
  const modId = req.session?.userId as string | undefined;
  if (!modId) return sendError(res, 401, "Sessione scaduta");
  try {
    const d = await getLatestDigestWithReadState(modId);
    if (!d) return res.json({ digest: null, digestId: null, read: false });
    return res.json({ digest: d.payload, digestId: d.digestId, read: d.read });
  } catch {
    return sendError(res, 500, "Errore digest");
  }
});

// Task #2551 — marca il digest come letto (idempotente).
const markReadSchema = z.object({ digestId: z.string().min(1).max(36) });
router.post("/ai/digest/mark-read", async (req: Request, res: Response) => {
  const modId = req.session?.userId as string | undefined;
  if (!modId) return sendError(res, 401, "Sessione scaduta");
  const parsed = markReadSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
  try {
    await markDigestRead(modId, parsed.data.digestId);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[ai/digest/mark-read] error:", err);
    return sendError(res, 500, "Errore mark-read");
  }
});

// Task #2551 — flag "non letto" per badge sull'hub report.
router.get("/ai/digest/unread", async (req: Request, res: Response) => {
  const modId = req.session?.userId as string | undefined;
  if (!modId) return sendError(res, 401, "Sessione scaduta");
  try {
    const unread = await hasUnreadDigest(modId);
    return res.json({ unread });
  } catch {
    return res.json({ unread: false });
  }
});

// Card per Hub Report (#2531) — stato AI in una chiamata.
router.get("/ai/hub-card", async (_req: Request, res: Response) => {
  try {
    const [budget, queue, providers, analyzed24h, anomaliesCount, acceptedRow] = await Promise.all([
      getBudgetStatus(), Promise.resolve(getQueueStats()), Promise.resolve(getProviderHealth()),
      db.select({ id: reports.id }).from(reports).where(gte(reports.aiAnalyzedAt, new Date(Date.now() - 24 * 60 * 60 * 1000))),
      db.select({ id: anomalyEvents.id }).from(anomalyEvents).where(gte(anomalyEvents.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))),
      db.select({
        accepted: sql<number>`sum(case when accepted_by_admin_id is not null then 1 else 0 end)::int`,
        total: sql<number>`count(*)::int`,
      }).from(aiSuggestionsLog).where(and(
        gte(aiSuggestionsLog.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
        eq(aiSuggestionsLog.scope, "action_draft"),
      )),
    ]);
    const acceptStat = acceptedRow[0] ?? { accepted: 0, total: 0 };
    return res.json({
      state: budget.state,
      budgetPct: budget.pct,
      providersAvailable: providers.filter((p) => p.available).length,
      providersTotal: providers.length,
      queuePending: queue.pending,
      analyzed24h: analyzed24h.length,
      anomalies24h: anomaliesCount.length,
      acceptedDrafts7d: acceptStat.accepted,
      totalDrafts7d: acceptStat.total,
    });
  } catch (err) {
    console.error("[ai/hub-card] error:", err);
    return sendError(res, 500, "Errore hub-card AI");
  }
});

export default router;

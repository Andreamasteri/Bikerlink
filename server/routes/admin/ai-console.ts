// Task #2637 — Endpoint REST/SSE per la AI Console unificata.
// Auth: role IN ('admin','moderator','superadmin').
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { and, desc, eq, lte, sql, isNull, or } from "drizzle-orm";
import { db } from "../../db";
import { storage } from "../../storage";
import { sendError } from "../../lib/api-response";
import {
  aiConversations,
  aiMessages,
  aiPinnedInsights,
  aiSuggestionsLog,
  aiWatchdogLog,
  integrityViolations,
  dbIntegrityViolations,
  aiUsageBudget,
} from "@shared/db";
import { routeMessage } from "../../ai/console/router";
import { runAgent } from "../../ai/console/agent";
import { hasAnyAiProvider, AI_NO_PROVIDER_MESSAGE } from "../../ai/moderation/provider";
import { buildSystemContext, loadMemory, updateMemory } from "../../ai/console/memory";
import { type Scope } from "../../ai/console/tools";

const router = Router();

// ── Auth middleware: admin/moderator/superadmin ───────────────────────────
export async function requireConsoleRole(req: Request, res: Response, next: () => void): Promise<void> {
  const userId = (req.session as { userId?: string })?.userId;
  if (!userId) { sendError(res, 401, "Non autenticato"); return; }
  try {
    const user = await storage.getUser(userId);
    if (!user) { sendError(res, 401, "Sessione non valida"); return; }
    const role = (user.role ?? "").toLowerCase();
    if (role !== "admin" && role !== "moderator" && role !== "superadmin") {
      sendError(res, 403, "Accesso non autorizzato");
      return;
    }
    (req as Request & { consoleUser?: typeof user }).consoleUser = user;
    next();
  } catch (e) {
    console.error("[ai-console/auth]", e);
    sendError(res, 500, "Errore autenticazione");
  }
}
router.use(requireConsoleRole);

// ── POST /console/message — SSE streaming agent ──────────────────────────
const MessageBody = z.object({
  conversationId: z.string().min(1).optional(),
  message: z.string().min(1).max(8000),
});

router.post("/ai/console/message", async (req: Request, res: Response) => {
  const parsed = MessageBody.safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, parsed.error.issues[0].message); return; }
  const userId = (req.session as { userId?: string }).userId as string;
  const { message } = parsed.data;
  let conversationId = parsed.data.conversationId;

  // Task #2825 — Nessun provider AI configurato: 503 + var mancanti prima di aprire l'SSE.
  if (!hasAnyAiProvider()) { sendError(res, 503, AI_NO_PROVIDER_MESSAGE); return; }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const abort = new AbortController();
  // Task #21 (porting da BikerBlog, contratto parità E1) — abort su `res.on("close")`,
  // NON `req.on("close")`: su Node 20 + express.json() la IncomingMessage emette
  // "close" appena il body POST è consumato (prima di questo punto), e "close" è
  // one-shot, quindi un listener su `req` agganciato dopo gli await non scatta mai
  // → abort morto (generazione AI che prosegue su socket chiuso). `res` emette
  // "close" solo alla reale chiusura della risposta. Vedi ai-assistant.ts.
  res.on("close", () => abort.abort());

  try {
    if (!conversationId) {
      const [row] = await db.insert(aiConversations).values({
        adminUserId: userId,
        title: message.slice(0, 80),
      }).returning({ id: aiConversations.id });
      conversationId = row.id;
      send("conversation", { id: conversationId });
    } else {
      // verifica ownership
      const [conv] = await db.select().from(aiConversations)
        .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.adminUserId, userId)))
        .limit(1);
      if (!conv) { send("error", { code: 404, message: "conversazione non trovata" }); res.end(); return; }
    }

    // Insert user message
    const [userMsg] = await db.insert(aiMessages).values({
      conversationId, role: "user", content: message,
    }).returning({ id: aiMessages.id });
    send("user_message", { id: userMsg.id });

    // Memoria + Router
    const memory = await loadMemory(conversationId);
    const sysCtx = buildSystemContext(memory);
    const routeRes = await routeMessage({ message, conversationContext: memory?.summary, adminId: userId });
    send("router", { scopes: routeRes.decision.scopes, reasoning: routeRes.decision.reasoning, cached: routeRes.cached });
    await db.insert(aiMessages).values({
      conversationId, role: "router", content: routeRes.decision.reasoning,
      scopes: routeRes.decision.scopes, model: routeRes.model, provider: routeRes.provider,
      costUsd: String(routeRes.costUsd),
    });

    // Storia (ultimi 10 turni user/assistant)
    const historyRows = await db.select({
      id: aiMessages.id, role: aiMessages.role, content: aiMessages.content,
    }).from(aiMessages)
      .where(and(
        eq(aiMessages.conversationId, conversationId),
        or(eq(aiMessages.role, "user"), eq(aiMessages.role, "assistant")),
      ))
      .orderBy(desc(aiMessages.createdAt)).limit(20);
    const history = historyRows.reverse()
      .filter((h) => h.content && h.id !== userMsg.id)
      .map((h) => ({ role: h.role as "user" | "assistant", content: h.content }));

    // Agente
    const agent = await runAgent({
      message, scopes: routeRes.decision.scopes as Scope[], systemContext: sysCtx,
      history, signal: abort.signal,
      onTextDelta: (delta) => send("delta", { text: delta }),
      onToolCall: (name, args) => send("tool_call", { name, args }),
      onToolResult: (name, result) => send("tool_result", { name, result }),
    });

    // Salva assistant message
    const [asstMsg] = await db.insert(aiMessages).values({
      conversationId, role: "assistant", content: agent.text,
      scopes: routeRes.decision.scopes, toolCalls: agent.toolCalls,
      model: agent.model, provider: agent.provider,
      tokensIn: agent.tokensIn, tokensOut: agent.tokensOut,
      costUsd: String(agent.costUsd),
    }).returning({ id: aiMessages.id });

    // Memoria + budget
    await updateMemory(conversationId, message, agent.text, routeRes.decision.scopes);
    await trackBudget(agent.costUsd + routeRes.costUsd);

    send("done", {
      messageId: asstMsg.id,
      provider: agent.provider, model: agent.model,
      tokensIn: agent.tokensIn, tokensOut: agent.tokensOut,
      costUsd: agent.costUsd + routeRes.costUsd, degraded: agent.degraded,
    });
    res.end();
  } catch (err) {
    console.error("[ai-console/message]", err);
    try { send("error", { code: 500, message: (err as Error).message }); } catch { /* */ }
    res.end();
  }
});

async function trackBudget(costUsd: number): Promise<void> {
  if (!costUsd || costUsd <= 0) return;
  try {
    const month = new Date().toISOString().slice(0, 7);
    await db.insert(aiUsageBudget)
      .values({ month, totalCostUsd: String(costUsd) })
      .onConflictDoUpdate({
        target: aiUsageBudget.month,
        set: {
          totalCostUsd: sql`${aiUsageBudget.totalCostUsd} + ${costUsd}`,
          updatedAt: new Date(),
        },
      });
  } catch (e) {
    console.warn("[ai-console/budget] update failed:", e);
  }
}

// ── GET /console/conversations ────────────────────────────────────────────
// Task #2645 — POST /ai/console/conversations: crea (o riusa per title esatto)
// una conversazione, con possibilità di preload di un messaggio iniziale
// (es. system-context per "Spiegami questo" o auto-thread Alerts).
const CreateConvBody = z.object({
  title: z.string().min(1).max(200),
  reuseByTitle: z.boolean().optional(),
  preload: z
    .object({
      role: z.enum(["system", "assistant", "user"]).default("system"),
      content: z.string().min(1).max(8000),
    })
    .optional(),
});
router.post("/ai/console/conversations", async (req: Request, res: Response) => {
  const userId = (req.session as { userId?: string }).userId as string;
  const parsed = CreateConvBody.safeParse(req.body ?? {});
  if (!parsed.success) { sendError(res, 400, parsed.error.issues[0].message); return; }
  const { title, reuseByTitle, preload } = parsed.data;

  let convId: string | null = null;
  if (reuseByTitle) {
    const [existing] = await db.select({ id: aiConversations.id }).from(aiConversations)
      .where(and(eq(aiConversations.adminUserId, userId), eq(aiConversations.title, title)))
      .orderBy(desc(aiConversations.createdAt)).limit(1);
    if (existing) convId = existing.id;
  }
  if (!convId) {
    const [row] = await db.insert(aiConversations).values({
      adminUserId: userId, title,
    }).returning({ id: aiConversations.id });
    convId = row.id;
  }
  if (preload) {
    await db.insert(aiMessages).values({
      conversationId: convId, role: preload.role, content: preload.content,
    });
  }
  res.json({ conversation: { id: convId, title } });
});

router.get("/ai/console/conversations", async (req: Request, res: Response) => {
  const userId = (req.session as { userId?: string }).userId as string;
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "30"), 10) || 30));
  const offset = Math.max(0, parseInt(String(req.query.offset ?? "0"), 10) || 0);
  const includeArchived = req.query.includeArchived === "1";
  const conds = [eq(aiConversations.adminUserId, userId)];
  if (!includeArchived) conds.push(isNull(aiConversations.archivedAt));
  const rows = await db.select().from(aiConversations)
    .where(and(...conds))
    .orderBy(desc(aiConversations.lastMessageAt)).limit(limit).offset(offset);
  res.json({ conversations: rows, limit, offset });
});

// ── GET /console/conversations/:id/messages ───────────────────────────────
router.get("/ai/console/conversations/:id/messages", async (req: Request, res: Response) => {
  const userId = (req.session as { userId?: string }).userId as string;
  const id = String(req.params.id);
  const [conv] = await db.select().from(aiConversations)
    .where(and(eq(aiConversations.id, id), eq(aiConversations.adminUserId, userId))).limit(1);
  if (!conv) { sendError(res, 404, "Conversazione non trovata"); return; }
  const rows = await db.select().from(aiMessages)
    .where(eq(aiMessages.conversationId, id))
    .orderBy(aiMessages.createdAt);
  res.json({ conversation: conv, messages: rows });
});

// ── POST /console/conversations/:id/pin/:messageId ────────────────────────
const PinBody = z.object({ title: z.string().max(200).optional(), note: z.string().max(2000).optional() });
router.post("/ai/console/conversations/:id/pin/:messageId", async (req: Request, res: Response) => {
  const userId = (req.session as { userId?: string }).userId as string;
  const id = String(req.params.id);
  const messageId = String(req.params.messageId);
  const parsed = PinBody.safeParse(req.body ?? {});
  if (!parsed.success) { sendError(res, 400, parsed.error.issues[0].message); return; }

  const [conv] = await db.select().from(aiConversations)
    .where(and(eq(aiConversations.id, id), eq(aiConversations.adminUserId, userId))).limit(1);
  if (!conv) { sendError(res, 404, "Conversazione non trovata"); return; }
  const [msg] = await db.select().from(aiMessages)
    .where(and(eq(aiMessages.id, messageId), eq(aiMessages.conversationId, id))).limit(1);
  if (!msg) { sendError(res, 404, "Messaggio non trovato"); return; }

  const [pin] = await db.insert(aiPinnedInsights).values({
    conversationId: id, messageId, adminUserId: userId,
    title: parsed.data.title ?? null, note: parsed.data.note ?? null,
  }).returning();
  // Task #2654 — emit Coordinator (graceful)
  try {
    const { emitConsolePin } = await import("../../ai/coordinator/integrations/console");
    await emitConsolePin({
      adminId: userId,
      pinId: pin.id,
      contentPreview: (msg.content ?? "").slice(0, 200),
      correlationId: `pin-${pin.id.slice(0, 12)}`,
    });
  } catch (e) { console.warn("[ai-console/pin] emit coordinator:", (e as Error).message); }
  res.json({ pin });
});

// Task #2645 — knowledge base condivisa: niente filtro per pinnedBy.
// Body fallback al contenuto del messaggio sorgente quando note è vuoto/nullo,
// così il pin "tap-only" da chat resta utile come knowledge card.
router.get("/ai/console/pinned", async (req: Request, res: Response) => {
  const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit ?? "200"), 10) || 200));
  const rows = await db.select({
    id: aiPinnedInsights.id,
    conversationId: aiPinnedInsights.conversationId,
    messageId: aiPinnedInsights.messageId,
    title: aiPinnedInsights.title,
    note: aiPinnedInsights.note,
    adminUserId: aiPinnedInsights.adminUserId,
    createdAt: aiPinnedInsights.createdAt,
    scopesHint: aiConversations.scopesHint,
    msgContent: aiMessages.content,
  }).from(aiPinnedInsights)
    .leftJoin(aiConversations, eq(aiConversations.id, aiPinnedInsights.conversationId))
    .leftJoin(aiMessages, eq(aiMessages.id, aiPinnedInsights.messageId))
    .orderBy(desc(aiPinnedInsights.createdAt)).limit(limit);
  const pinned = rows.map((r) => {
    const scopesArr = Array.isArray(r.scopesHint) ? (r.scopesHint as string[]) : null;
    const noteStr = r.note && String(r.note).trim().length > 0 ? String(r.note) : null;
    const msgStr = r.msgContent && String(r.msgContent).trim().length > 0 ? String(r.msgContent) : null;
    return {
      id: r.id,
      conversationId: r.conversationId,
      messageId: r.messageId,
      title: r.title ?? (msgStr ? msgStr.slice(0, 80) : "Insight"),
      body: noteStr ?? msgStr ?? "",
      scope: scopesArr && scopesArr.length ? String(scopesArr[0]) : null,
      pinnedBy: r.adminUserId,
      pinnedByNickname: null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    };
  });
  res.json({ pinned });
});

// Task #2645 — unpin (cancellazione hard, qualsiasi admin può rimuovere).
router.delete("/ai/console/pinned/:id", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const [del] = await db.delete(aiPinnedInsights)
    .where(eq(aiPinnedInsights.id, id))
    .returning({ id: aiPinnedInsights.id });
  if (!del) { sendError(res, 404, "Insight non trovato"); return; }
  res.json({ unpinned: true });
});

// ── DELETE /console/conversations/:id — soft delete ───────────────────────
router.delete("/ai/console/conversations/:id", async (req: Request, res: Response) => {
  const userId = (req.session as { userId?: string }).userId as string;
  const id = String(req.params.id);
  const [updated] = await db.update(aiConversations).set({ archivedAt: new Date() })
    .where(and(eq(aiConversations.id, id), eq(aiConversations.adminUserId, userId)))
    .returning({ id: aiConversations.id });
  if (!updated) { sendError(res, 404, "Conversazione non trovata"); return; }
  res.json({ archived: true });
});

// ── GET /ai/actions/pending — coda consolidata multi-scope ────────────────
router.get("/ai/actions/pending", async (req: Request, res: Response) => {
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));

  const [modSuggestions, watchdogProposals, dbViol, appViol] = await Promise.all([
    db.select({
      id: aiSuggestionsLog.id, kind: sql<string>`'moderation_suggestion'`,
      scope: sql<string>`'moderation'`,
      severity: sql<string>`COALESCE(${aiSuggestionsLog.scope}, 'medium')`,
      summary: sql<string>`COALESCE(LEFT(${aiSuggestionsLog.response}, 200), '')`,
      refId: aiSuggestionsLog.reportId,
      createdAt: aiSuggestionsLog.createdAt,
    }).from(aiSuggestionsLog)
      .where(and(
        eq(aiSuggestionsLog.scope, "action_draft"),
        isNull(aiSuggestionsLog.acceptedAt),
        isNull(aiSuggestionsLog.rejectedAt),
      ))
      .orderBy(desc(aiSuggestionsLog.createdAt)).limit(limit),

    db.select({
      id: aiWatchdogLog.id, kind: sql<string>`'watchdog_proposal'`,
      scope: sql<string>`'watchdog'`,
      severity: aiWatchdogLog.status,
      summary: aiWatchdogLog.summary,
      refId: aiWatchdogLog.scope,
      createdAt: aiWatchdogLog.createdAt,
    }).from(aiWatchdogLog)
      .where(and(eq(aiWatchdogLog.kind, "proposal"), eq(aiWatchdogLog.status, "pending")))
      .orderBy(desc(aiWatchdogLog.createdAt)).limit(limit),

    db.select({
      id: dbIntegrityViolations.id, kind: sql<string>`'db_integrity_violation'`,
      scope: sql<string>`'db-integrity'`,
      severity: dbIntegrityViolations.severity,
      summary: dbIntegrityViolations.checkId,
      refId: dbIntegrityViolations.runId,
      createdAt: dbIntegrityViolations.createdAt,
    }).from(dbIntegrityViolations).where(eq(dbIntegrityViolations.status, "open"))
      .orderBy(desc(dbIntegrityViolations.createdAt)).limit(limit),

    db.select({
      id: integrityViolations.id, kind: sql<string>`'app_integrity_violation'`,
      scope: sql<string>`'app-integrity'`,
      severity: integrityViolations.severity,
      summary: integrityViolations.checkId,
      refId: integrityViolations.runId,
      createdAt: integrityViolations.createdAt,
    }).from(integrityViolations).where(eq(integrityViolations.status, "open"))
      .orderBy(desc(integrityViolations.createdAt)).limit(limit),
  ]);

  const all = [...modSuggestions, ...watchdogProposals, ...dbViol, ...appViol];
  const now = Date.now();
  const ranked = all.map((a) => {
    const ageH = Math.max(0, (now - (a.createdAt instanceof Date ? a.createdAt.getTime() : now)) / 3600_000);
    const sevScore = sevWeight(a.severity);
    return { ...a, priority: Math.round((sevScore * 10 - Math.min(72, ageH) * 0.1) * 100) / 100 };
  }).sort((a, b) => b.priority - a.priority).slice(0, limit);

  res.json({
    items: ranked, total: all.length,
    byScope: countBy(ranked, "scope"),
  });
});

function sevWeight(s: string | null | undefined): number {
  switch ((s ?? "").toLowerCase()) {
    case "critical": return 5;
    case "high": return 4;
    case "warn": case "warning": case "medium": case "pending": return 3;
    case "info": case "low": return 2;
    default: return 1;
  }
}

function countBy<T extends Record<string, unknown>>(arr: T[], key: keyof T): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of arr) {
    const k = String(r[key] ?? "?");
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

// keep `lte` referenced (unused-helper safeguard).
void lte;

export default router;

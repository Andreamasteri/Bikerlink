/**
 * ai-console.next.ts — file successore di ai-console.ts
 *
 * Contenuto:
 *   - GET /ai/console/search — full-text search su aiMessages.content
 *   - GET /ai/console/scopes — elenco scope disponibili
 *   - GET /ai/console/budget — stato budget reale AI
 *   - GET /ai/console/admin-prefs — preferenze admin
 *   - PATCH /ai/console/admin-prefs — aggiornamento preferenze admin
 *   - GET /ai/providers/health — stato salute provider AI
 *   - POST /ai/providers/reset — reset cooldown provider AI
 */

import { Router, type Request, type Response } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../../db";
import { sendError } from "../../lib/api-response";
import { aiConversations, aiMessages } from "@shared/db";
import { users as usersTable } from "@shared/db";
import { SCOPES } from "../../ai/console/tools";
import { getBudgetStatus } from "../../ai/moderation/budget";
import { requireConsoleRole } from "./ai-console";
import { getProviderHealth, markProviderOk } from "../../ai/moderation/provider";
import { storage } from "../../storage";
import { z } from "zod";

const router = Router();

router.use(requireConsoleRole);

// ── GET /console/search?q=... — full-text su aiMessages.content ───────────
router.get("/ai/console/search", async (req: Request, res: Response) => {
  const userId = (req.session as { userId?: string }).userId as string;
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) { sendError(res, 400, "q troppo corto (min 2 caratteri)"); return; }
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "30"), 10) || 30));
  const sinceParam = req.query.sinceHours ? parseInt(String(req.query.sinceHours), 10) : null;
  const conds = [
    eq(aiConversations.adminUserId, userId),
    sql`${aiMessages.content} ILIKE ${"%" + q + "%"}`,
  ];
  if (sinceParam && sinceParam > 0) {
    conds.push(gte(aiMessages.createdAt, new Date(Date.now() - sinceParam * 3600_000)));
  }
  const rows = await db.select({
    messageId: aiMessages.id, conversationId: aiMessages.conversationId,
    role: aiMessages.role, content: aiMessages.content, createdAt: aiMessages.createdAt,
    convTitle: aiConversations.title,
  }).from(aiMessages)
    .innerJoin(aiConversations, eq(aiConversations.id, aiMessages.conversationId))
    .where(and(...conds))
    .orderBy(desc(aiMessages.createdAt)).limit(limit);
  res.json({ q, results: rows.map((r) => ({
    ...r, snippet: snippet(r.content, q),
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  })) });
});

function snippet(content: string, q: string): string {
  const i = content.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return content.slice(0, 200);
  const start = Math.max(0, i - 60);
  const end = Math.min(content.length, i + q.length + 100);
  return (start > 0 ? "…" : "") + content.slice(start, end) + (end < content.length ? "…" : "");
}

// ── GET /console/scopes — elenco scope ────────────────────────────────────
router.get("/ai/console/scopes", (_req: Request, res: Response) => {
  res.json({ scopes: SCOPES });
});

// ── GET /ai/console/budget — stato budget reale ───────────────────────────
router.get("/ai/console/budget", async (_req: Request, res: Response) => {
  try {
    const status = await getBudgetStatus();
    res.json(status);
  } catch (e) {
    console.error("[ai-console/budget]", e);
    sendError(res, 500, "Errore lettura budget");
  }
});

// ── GET /ai/console/admin-prefs — preferenze admin ───────────────────────
router.get("/ai/console/admin-prefs", async (req: Request, res: Response) => {
  const userId = (req.session as { userId?: string }).userId as string;
  const [row] = await db.select({ adminPrefs: usersTable.adminPrefs })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const prefs = (row?.adminPrefs ?? {}) as Record<string, unknown>;
  res.json({ prefs });
});

const PrefsPatch = z.object({}).catchall(z.unknown());
router.patch("/ai/console/admin-prefs", async (req: Request, res: Response) => {
  const userId = (req.session as { userId?: string }).userId as string;
  const parsed = PrefsPatch.safeParse(req.body ?? {});
  if (!parsed.success) { sendError(res, 400, "Body invalido"); return; }
  const [row] = await db.select({ adminPrefs: usersTable.adminPrefs })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const current = (row?.adminPrefs ?? {}) as Record<string, unknown>;
  const next = { ...current, ...parsed.data };
  await db.update(usersTable).set({ adminPrefs: next, updatedAt: new Date() })
    .where(eq(usersTable.id, userId));
  res.json({ prefs: next });
});

// ─── Provider health + reset cooldown ─────────────────────────────────────────
// Health: admin | moderator | superadmin (requireConsoleRole già applicato).
// Reset: admin | superadmin only (guard inline).
router.get("/ai/providers/health", (_req: Request, res: Response) => {
  return res.json({ providers: getProviderHealth() });
});

const resetProviderSchema = z.object({
  providerId: z.enum(["openai", "google", "groq"]).optional(),
});

type ConsoleReq = Request & { consoleUser?: { id: string; role: string } };

router.post("/ai/providers/reset", async (req: ConsoleReq, res: Response) => {
  const role = (req.consoleUser?.role ?? "").toLowerCase();
  if (role !== "admin" && role !== "superadmin") {
    return sendError(res, 403, "Richiesto ruolo admin o superadmin");
  }
  const parsed = resetProviderSchema.safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
  const modId = (req.session as { userId?: string }).userId;
  if (!modId) return sendError(res, 401, "Sessione scaduta");
  try {
    const allIds = ["openai", "google", "groq"] as const;
    const targets = parsed.data.providerId ? [parsed.data.providerId] : allIds;
    for (const id of targets) markProviderOk(id);
    await storage.createModeratorLog({
      moderatorId: modId, action: "ai_provider_cooldown_reset",
      targetType: "system", targetId: parsed.data.providerId ?? "all",
      details: `reset cooldown: ${targets.join(", ")}`,
    }).catch(() => {});
    return res.json({ ok: true, reset: targets, providers: getProviderHealth() });
  } catch (err) {
    console.error("[ai/providers/reset] error:", err);
    return sendError(res, 500, "Errore reset cooldown provider");
  }
});

export default router;

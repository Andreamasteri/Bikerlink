// Estratto da ai-assistant.ts (limite 600 righe) — prefs utente, memoria
// conversazionale (history) e beacon di telemetria client.
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, withDbRetry } from "../db";
import { sendError } from "../lib/api-response";
import { users as usersTable } from "@shared/db";
import { logAssistantEvent } from "../ai/assistant/telemetry";
import { requireUser } from "./ai-assistant-helpers";

const router = Router();

// ── User prefs ────────────────────────────────────────────────────────────
router.get("/users/me/assistant-prefs", requireUser, async (req: Request, res: Response) => {
  const userId = (req.session as { userId?: string }).userId as string;
  const [row] = await withDbRetry(() => db.select({ assistantPrefs: usersTable.assistantPrefs })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1));
  res.json({ prefs: row?.assistantPrefs ?? {} });
});

const PrefsPatch = z.object({
  disabled: z.boolean().optional(),
  proactiveDisabled: z.boolean().optional(),
  onboardingDisabled: z.boolean().optional(),
});

router.patch("/users/me/assistant-prefs", requireUser, async (req: Request, res: Response) => {
  const userId = (req.session as { userId?: string }).userId as string;
  const parsed = PrefsPatch.safeParse(req.body ?? {});
  if (!parsed.success) { sendError(res, 400, parsed.error.issues[0].message); return; }
  const [row] = await db.select({ assistantPrefs: usersTable.assistantPrefs })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const current = (row?.assistantPrefs ?? {}) as Record<string, unknown>;
  const next = { ...current, ...parsed.data, updatedAt: new Date().toISOString() };
  await db.update(usersTable).set({ assistantPrefs: next, updatedAt: new Date() })
    .where(eq(usersTable.id, userId));
  const user = (req as Request & { sessionUser?: { role?: string | null } }).sessionUser;
  await logAssistantEvent({
    eventType: "opt_out_changed",
    platform: typeof req.body?.platform === "string" ? req.body.platform : "unknown",
    userRole: user?.role ?? null,
    userId,
    payload: parsed.data,
  });
  res.json({ prefs: next });
});

// ── GET /api/ai/assistant/history — ultimi N turni della memoria conversazionale ──
router.get("/ai/assistant/history", requireUser, async (req: Request, res: Response) => {
  const userId = (req as Request & { sessionUser?: { id: string } }).sessionUser!.id;
  const limitRaw = parseInt(String(req.query.limit ?? "20"), 10);
  const limit = Math.min(Math.max(isNaN(limitRaw) ? 20 : limitRaw, 1), 100);
  try {
    const { db } = await import("../db");
    const { aiConversationTurns } = await import("@shared/db");
    const { eq, desc } = await import("drizzle-orm");
    const rows = await db
      .select({
        id: aiConversationTurns.id,
        role: aiConversationTurns.role,
        content: aiConversationTurns.content,
        createdAt: aiConversationTurns.createdAt,
      })
      .from(aiConversationTurns)
      .where(eq(aiConversationTurns.userId, userId))
      .orderBy(desc(aiConversationTurns.createdAt))
      .limit(limit);
    return res.json({ turns: rows.reverse(), total: rows.length });
  } catch (err) {
    return sendError(res, 500, (err as Error).message);
  }
});

// ── DELETE /api/ai/assistant/history — cancella tutta la memoria conversazionale ──
router.delete("/ai/assistant/history", requireUser, async (req: Request, res: Response) => {
  const userId = (req as Request & { sessionUser?: { id: string } }).sessionUser!.id;
  try {
    const { db } = await import("../db");
    const { aiConversationTurns } = await import("@shared/db");
    const { eq } = await import("drizzle-orm");
    await db.delete(aiConversationTurns).where(eq(aiConversationTurns.userId, userId));
    return res.json({ ok: true, deleted: true });
  } catch (err) {
    return sendError(res, 500, (err as Error).message);
  }
});

// ── Client telemetry beacon (tip_shown/dismissed, onboarding, ecc.) ──────
const ClientTelemetryBody = z.object({
  eventType: z.enum([
    "tip_shown", "tip_dismissed", "tip_disabled_permanent",
    "onboarding_started", "onboarding_completed", "conversation_started",
  ]),
  platform: z.string().min(1).max(16),
  payload: z.record(z.string(), z.unknown()).optional(),
});

router.post("/ai/assistant/telemetry", requireUser, async (req: Request, res: Response) => {
  const parsed = ClientTelemetryBody.safeParse(req.body ?? {});
  if (!parsed.success) { sendError(res, 400, parsed.error.issues[0].message); return; }
  const user = (req as Request & { sessionUser?: { id: string; role?: string | null } }).sessionUser!;
  await logAssistantEvent({
    eventType: parsed.data.eventType,
    platform: parsed.data.platform,
    userRole: user.role ?? null,
    userId: user.id,
    payload: parsed.data.payload ?? {},
  });
  res.json({ ok: true });
});

export default router;

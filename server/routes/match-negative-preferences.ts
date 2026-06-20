import { Router, type Request, type Response } from "express";
import { db, withDbRetry } from "../db";
import {
  matchNegativePreferences,
  pendingAutoSuggestions,
  negativePrefSchema,
  NEGATIVE_PREF_KINDS,
  FORBIDDEN_NEGATIVE_KINDS,
} from "@shared/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";
import { sendError, sendSuccess } from "../lib/api-response";

const router = Router();

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const rows = await withDbRetry(() => db
      .select()
      .from(matchNegativePreferences)
      .where(eq(matchNegativePreferences.userId, userId))
      .orderBy(desc(matchNegativePreferences.createdAt)));
    return res.json({ preferences: rows });
  } catch (err) {
    console.error("[MatchNegPrefs] GET error:", err);
    return sendError(res, 500, "Errore interno");
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const body = req.body as { kind?: unknown; value?: unknown };
    const kind = String(body.kind ?? "");
    if ((FORBIDDEN_NEGATIVE_KINDS as readonly string[]).includes(kind)) {
      return sendError(res, 400, "Filtro non consentito dalla policy della community");
    }
    if (!(NEGATIVE_PREF_KINDS as readonly string[]).includes(kind)) {
      return sendError(res, 400, "Tipo di filtro non riconosciuto");
    }
    const parsed = negativePrefSchema.safeParse({ kind, value: body.value });
    if (!parsed.success) {
      return sendError(res, 400, "Valore filtro non valido");
    }
    const valueJson = JSON.stringify(parsed.data.value);
    const result = await db.execute(sql`
      INSERT INTO match_negative_preferences (user_id, kind, value, source)
      VALUES (${userId}, ${parsed.data.kind}, ${sql.raw(`'${valueJson.replace(/'/g, "''")}'::jsonb`)}, 'manual')
      ON CONFLICT (user_id, kind, (value::text))
      DO UPDATE SET source = 'manual'
      RETURNING *
    `);
    const inserted = (result.rows as Array<Record<string, unknown>>)[0];
    return res.json({ preference: inserted });
  } catch (err) {
    console.error("[MatchNegPrefs] POST error:", err);
    return sendError(res, 500, "Errore interno");
  }
});

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const id = req.params.id as string;
    const result = await db
      .delete(matchNegativePreferences)
      .where(and(eq(matchNegativePreferences.id, id), eq(matchNegativePreferences.userId, userId)))
      .returning({ id: matchNegativePreferences.id });
    if (result.length === 0) return sendError(res, 404, "Filtro non trovato");
    return sendSuccess(res);
  } catch (err) {
    console.error("[MatchNegPrefs] DELETE error:", err);
    return sendError(res, 500, "Errore interno");
  }
});

router.get("/suggestions", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const rows = await withDbRetry(() => db
      .select()
      .from(pendingAutoSuggestions)
      .where(and(eq(pendingAutoSuggestions.userId, userId), eq(pendingAutoSuggestions.status, "pending")))
      .orderBy(desc(pendingAutoSuggestions.rejectCount)));
    return res.json({ suggestions: rows });
  } catch (err) {
    console.error("[MatchNegPrefs] suggestions GET error:", err);
    return sendError(res, 500, "Errore interno");
  }
});

router.post("/suggestions/:id/accept", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const id = req.params.id as string;
    const [suggestion] = await db
      .select()
      .from(pendingAutoSuggestions)
      .where(and(eq(pendingAutoSuggestions.id, id), eq(pendingAutoSuggestions.userId, userId)))
      .limit(1);
    if (!suggestion) return sendError(res, 404, "Suggerimento non trovato");
    if (suggestion.status !== "pending") return sendError(res, 400, "Suggerimento già gestito");

    if ((FORBIDDEN_NEGATIVE_KINDS as readonly string[]).includes(suggestion.kind)) {
      await db
        .update(pendingAutoSuggestions)
        .set({ status: "rejected", resolvedAt: new Date() })
        .where(eq(pendingAutoSuggestions.id, id));
      return sendError(res, 400, "Filtro non consentito dalla policy");
    }
    const parsed = negativePrefSchema.safeParse({ kind: suggestion.kind, value: suggestion.value });
    if (!parsed.success) {
      return sendError(res, 400, "Suggerimento non valido");
    }

    const valueJson = JSON.stringify(parsed.data.value);
    await db.execute(sql`
      INSERT INTO match_negative_preferences (user_id, kind, value, source)
      VALUES (${userId}, ${parsed.data.kind}, ${sql.raw(`'${valueJson.replace(/'/g, "''")}'::jsonb`)}, 'auto_suggested')
      ON CONFLICT (user_id, kind, (value::text))
      DO UPDATE SET source = 'auto_suggested'
    `);
    await db
      .update(pendingAutoSuggestions)
      .set({ status: "accepted", resolvedAt: new Date() })
      .where(eq(pendingAutoSuggestions.id, id));
    return sendSuccess(res);
  } catch (err) {
    console.error("[MatchNegPrefs] accept suggestion error:", err);
    return sendError(res, 500, "Errore interno");
  }
});

router.post("/suggestions/:id/dismiss", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const id = req.params.id as string;
    const body = req.body as { snooze?: boolean };
    const status = body.snooze ? "snoozed" : "rejected";
    const result = await db
      .update(pendingAutoSuggestions)
      .set({ status, resolvedAt: new Date() })
      .where(and(eq(pendingAutoSuggestions.id, id), eq(pendingAutoSuggestions.userId, userId)))
      .returning({ id: pendingAutoSuggestions.id });
    if (result.length === 0) return sendError(res, 404, "Suggerimento non trovato");
    return sendSuccess(res);
  } catch (err) {
    console.error("[MatchNegPrefs] dismiss suggestion error:", err);
    return sendError(res, 500, "Errore interno");
  }
});

export default router;

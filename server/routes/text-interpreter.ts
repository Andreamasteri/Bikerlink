/**
 * User-facing text interpreter endpoints (Task #2518).
 * GET /api/text-interpreter/suggest?q=&category=&limit=
 *
 * Rate-limited (textInterpreterRateLimiter — 60/min per user).
 * Richiede una sessione attiva: l'autenticazione globale è gestita dal
 * middleware in server/routes.ts; qui controlliamo solo che req.session.userId
 * esista come safety net.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { sendError } from "../lib/api-response";
import { textInterpreterRateLimiter } from "../lib/rate-limiters";
import { interpret } from "../text-interpreter/interpret";
import { TEXT_ALIAS_CATEGORIES, type TextAliasCategory } from "@shared/db";

const router = Router();

const suggestSchema = z.object({
  q: z.string().min(1).max(120),
  category: z.enum(TEXT_ALIAS_CATEGORIES),
  limit: z.coerce.number().int().min(1).max(20).optional(),
  threshold: z.coerce.number().min(0).max(1).optional(),
});

router.get("/suggest", textInterpreterRateLimiter, async (req: Request, res: Response) => {
  if (!req.session?.userId) return sendError(res, 401, "Sessione richiesta");
  const parsed = suggestSchema.safeParse(req.query);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
  const { q, category, limit, threshold } = parsed.data;
  try {
    const result = await interpret(q, category as TextAliasCategory, { limit, threshold });
    return res.json(result);
  } catch (err) {
    console.error("[text-interpreter/suggest] error:", err);
    return sendError(res, 500, "Errore interprete testo");
  }
});

export default router;

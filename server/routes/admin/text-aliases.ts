/**
 * Admin text aliases & interpreter debug (Task #2518).
 *
 *  GET    /api/admin/text-aliases?category=         → lista alias
 *  POST   /api/admin/text-aliases                   → crea alias
 *  DELETE /api/admin/text-aliases/:id               → elimina alias
 *  GET    /api/admin/text-interpreter/test?q=&category=&threshold=&limit=
 *         → dump diagnostico: exact, alias, fuzzy[]
 *
 * Tutte le rotte sono già protette da _requireAdmin nel parent router
 * (server/routes/admin.ts).
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { sendError } from "../../lib/api-response";
import { interpret } from "../../text-interpreter/interpret";
import { TEXT_ALIAS_CATEGORIES, type TextAliasCategory } from "@shared/db";

const router = Router();

const createSchema = z.object({
  category: z.enum(TEXT_ALIAS_CATEGORIES),
  input: z.string().min(1).max(200),
  targetId: z.string().min(1).max(36).optional().nullable(),
  targetValue: z.string().min(1).max(200).optional().nullable(),
  confidence: z.number().min(0).max(1).optional(),
});

const testSchema = z.object({
  q: z.string().min(1).max(200),
  category: z.enum(TEXT_ALIAS_CATEGORIES),
  threshold: z.coerce.number().min(0).max(1).optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

router.get("/text-aliases", async (req: Request, res: Response) => {
  try {
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const rows = await storage.listTextAliases(category);
    return res.json({ aliases: rows });
  } catch (err) {
    console.error("[admin/text-aliases] GET error:", err);
    return sendError(res, 500, "Errore lettura alias");
  }
});

router.post("/text-aliases", async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
  try {
    const alias = await storage.createTextAlias({
      category: parsed.data.category,
      input: parsed.data.input,
      targetId: parsed.data.targetId ?? null,
      targetValue: parsed.data.targetValue ?? null,
      confidence: parsed.data.confidence,
      source: "manual",
    });
    return res.status(201).json(alias);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/duplicate key|unique/i.test(msg)) {
      return sendError(res, 409, "Alias già esistente per questa categoria");
    }
    console.error("[admin/text-aliases] POST error:", err);
    return sendError(res, 500, msg || "Errore creazione alias");
  }
});

router.delete("/text-aliases/:id", async (req: Request, res: Response) => {
  const idParam = req.params.id;
  const id = typeof idParam === "string" ? idParam : Array.isArray(idParam) ? idParam[0] : "";
  if (!id) return sendError(res, 400, "ID mancante");
  try {
    const deleted = await storage.deleteTextAlias(id);
    if (!deleted) return sendError(res, 404, "Alias non trovato");
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin/text-aliases] DELETE error:", err);
    return sendError(res, 500, "Errore eliminazione alias");
  }
});

router.get("/text-interpreter/test", async (req: Request, res: Response) => {
  const parsed = testSchema.safeParse(req.query);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
  try {
    const result = await interpret(parsed.data.q, parsed.data.category as TextAliasCategory, {
      threshold: parsed.data.threshold,
      limit: parsed.data.limit,
    });
    return res.json(result);
  } catch (err) {
    console.error("[admin/text-interpreter/test] error:", err);
    return sendError(res, 500, "Errore test interprete");
  }
});

export default router;

// Task #2603 — estratto da server/routes/admin/matching.ts (mechanical split)
import { Router, type Request, type Response } from "express";
import { db } from "../../../db";
import { matchRules, updateMatchRuleSchema, insertMatchRuleSchema } from "@shared/db";
import { sendError } from "../../../lib/api-response";
import { eq } from "drizzle-orm";
import { invalidateMatchRulesCache } from "../../../matching/rules-cache";

const router = Router();

// ──────────────────────────────────────────────────────────────────────────
// Match Rules (Task #2511) — configurable compatibility matrix.
// GET lists all pairs; PATCH updates a single rule and invalidates the cache.
// ──────────────────────────────────────────────────────────────────────────
router.get("/match-rules", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(matchRules).orderBy(matchRules.searchTypeA, matchRules.searchTypeB);
    return res.json({ rules: rows });
  } catch (err) {
    console.error("[admin] GET /match-rules error:", err);
    return sendError(res, 500, "Errore lettura match rules");
  }
});

// POST /match-rules (Task #2540) — crea una nuova regola di compatibilità.
router.post("/match-rules", async (req: Request, res: Response) => {
  try {
    const parsed = insertMatchRuleSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const { searchTypeA, searchTypeB, compatible, weight, notes } = parsed.data;
    // Pair coerente: A <= B (ordine alfabetico) per evitare duplicati invertiti
    const [a, b] = searchTypeA <= searchTypeB ? [searchTypeA, searchTypeB] : [searchTypeB, searchTypeA];
    try {
      const [row] = await db.insert(matchRules).values({
        searchTypeA: a, searchTypeB: b, compatible, weight, notes: notes ?? null,
      }).returning();
      invalidateMatchRulesCache();
      return res.json({ rule: row });
    } catch (err) {
      const msg = (err as Error).message ?? "";
      if (msg.includes("unique") || msg.includes("duplicate")) {
        return sendError(res, 409, "Regola già esistente per questa coppia");
      }
      throw err;
    }
  } catch (err) {
    console.error("[admin] POST /match-rules error:", err);
    return sendError(res, 500, "Errore creazione regola");
  }
});

// DELETE /match-rules/:id (Task #2540) — rimuove una regola.
router.delete("/match-rules/:id", async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id;
    const id: string | null = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? (rawId[0] ?? null) : null;
    if (!id) return sendError(res, 400, "ID mancante");
    const [deleted] = await db.delete(matchRules).where(eq(matchRules.id, id)).returning();
    if (!deleted) return sendError(res, 404, "Regola non trovata");
    invalidateMatchRulesCache();
    return res.json({ ok: true, id });
  } catch (err) {
    console.error("[admin] DELETE /match-rules/:id error:", err);
    return sendError(res, 500, "Errore eliminazione regola");
  }
});

router.patch("/match-rules/:id", async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id;
    const id: string | null = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? (rawId[0] ?? null) : null;
    if (!id) return sendError(res, 400, "ID mancante");
    const parsed = updateMatchRuleSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.compatible !== undefined) updates.compatible = parsed.data.compatible;
    if (parsed.data.weight !== undefined) updates.weight = parsed.data.weight;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
    const [updated] = await db.update(matchRules).set(updates).where(eq(matchRules.id, id)).returning();
    if (!updated) return sendError(res, 404, "Regola non trovata");
    invalidateMatchRulesCache();
    return res.json({ rule: updated });
  } catch (err) {
    console.error("[admin] PATCH /match-rules/:id error:", err);
    return sendError(res, 500, "Errore aggiornamento regola");
  }
});

export default router;

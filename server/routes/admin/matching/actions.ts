// Task #2603 — estratto da server/routes/admin/matching.ts (mechanical split)
import { Router, type Request, type Response } from "express";
import { db, pool } from "../../../db";
import { bikerZavarrinaMatches, bikerBikerMatches } from "@shared/db";
import { MATCHING_REGISTRY } from "@shared/matching-registry";
import { sendSuccess, sendError } from "../../../lib/api-response";
import { sql } from "drizzle-orm";
import { triggerMatchingRun } from "../../../matching-engine";
import { forceUnlockMatching, getMatchingLockState } from "../../../matching/scheduler";

const router = Router();

router.post("/match-settings/reset-all", async (_req: Request, res: Response) => {
  try {
    // Task #2527 — derivato dal registry (niente più lista hardcoded).
    // Filtra solo le colonne effettivamente presenti su `match_preferences`
    // (gli slot affinity senza colonna fisica vengono ignorati a runtime).
    const client = await pool.connect();
    let schemaCols: Set<string>;
    try {
      const schemaRes = await client.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema='public' AND table_name='match_preferences'`
      );
      schemaCols = new Set(schemaRes.rows.map((r) => r.column_name));
    } finally {
      client.release();
    }
    const cols = MATCHING_REGISTRY
      .map((t) => t.prefColumn)
      .filter((c) => schemaCols.has(c));
    if (cols.length === 0) {
      return sendError(res, 500, "Nessuna colonna da resettare");
    }
    const setExpr = cols.map((c) => `${c} = true`).join(", ");
    const result = await db.execute(sql.raw(
      `UPDATE match_preferences SET ${setExpr}, updated_at = NOW()`
    ));
    const affected = (result.rowCount as number | null) ?? 0;
    return res.json({ success: true, affected, columns: cols.length });
  } catch (_error) {
    return sendError(res, 500, "Errore reset settings matching");
  }
});

router.post("/matches/recalculate-all", async (_req: Request, res: Response) => {
  try {
    const result = triggerMatchingRun();
    return res.json(result);
  } catch (_error) {
    return sendError(res, 500, "Errore ricalcolo matching");
  }
});

router.post("/force-matching", async (_req: Request, res: Response) => {
  try {
    triggerMatchingRun();
    return sendSuccess(res, { status: "triggered" });
  } catch (_error) {
    return sendError(res, 500, "Errore avvio matching");
  }
});

router.post("/matching/trigger", async (_req: Request, res: Response) => {
  try {
    triggerMatchingRun();
    return res.json({ status: "triggered" });
  } catch (_error) {
    return sendError(res, 500, "Errore avvio matching");
  }
});

router.delete("/reset-matches", async (_req: Request, res: Response) => {
  try {
    const bzDeleted = await db.delete(bikerZavarrinaMatches).returning({ id: bikerZavarrinaMatches.id });
    const bbDeleted = await db.delete(bikerBikerMatches).returning({ id: bikerBikerMatches.id });
    const unlock = forceUnlockMatching();
    console.log(
      `[admin/reset-matches] biker_biker=${bbDeleted.length}, biker_zavorrina=${bzDeleted.length}, wasRunning=${unlock.wasRunning}`
    );
    return res.json({
      success: true,
      deleted: {
        bikerBiker: bbDeleted.length,
        bikerZavorrina: bzDeleted.length,
        total: bbDeleted.length + bzDeleted.length,
      },
      unlock,
    });
  } catch (error) {
    console.error("[admin/reset-matches] error:", error);
    return sendError(res, 500, "Errore reset match");
  }
});

router.post("/matching/force-unlock", async (_req: Request, res: Response) => {
  try {
    const before = getMatchingLockState();
    const unlock = forceUnlockMatching();
    return res.json({ success: true, before, unlock });
  } catch (error) {
    console.error("[admin/matching/force-unlock] error:", error);
    return sendError(res, 500, "Errore force-unlock matching");
  }
});

export default router;

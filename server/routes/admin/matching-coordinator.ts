// Task #5318 — Endpoint admin (read-only + override manuale di test) per il
// Matching Coordinator. Montato sotto _requireAdmin in admin.ts (stesso
// pattern degli altri router admin).
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../../db";
import { aiWatchdogLog } from "@shared/db";
import { and, desc, eq } from "drizzle-orm";
import { sendError } from "../../lib/api-response";
import { getCoordinatorSnapshot, applyCoordinatorDirective } from "../../matching/coordinator";

const router = Router();

router.get("/matching-coordinator/state", async (_req: Request, res: Response) => {
  try {
    const snapshot = await getCoordinatorSnapshot();
    return res.json(snapshot);
  } catch (err) {
    return sendError(res, 500, (err as Error).message);
  }
});

router.get("/matching-coordinator/history", async (req: Request, res: Response) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
  try {
    const rows = await db
      .select()
      .from(aiWatchdogLog)
      .where(and(eq(aiWatchdogLog.kind, "coordinator"), eq(aiWatchdogLog.scope, "matching_coordinator")))
      .orderBy(desc(aiWatchdogLog.createdAt))
      .limit(limit);
    return res.json({ entries: rows });
  } catch (err) {
    return sendError(res, 500, (err as Error).message);
  }
});

// Override manuale — SOLO per test/emergenza admin (issuedBy="admin_manual").
// Il flusso normale è Bowie → Horus (coordinator-bridge.ts), che chiama
// applyCoordinatorDirective con issuedBy="horus".
router.post("/matching-coordinator/directive", async (req: Request, res: Response) => {
  const schema = z.object({
    kind: z.enum(["pause", "resume", "force_cycle"]),
    reason: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);

  const result = await applyCoordinatorDirective(parsed.data.kind, { reason: parsed.data.reason }, "admin_manual");
  if (!result.ok) return sendError(res, 400, result.error);
  return res.json(result);
});

export default router;

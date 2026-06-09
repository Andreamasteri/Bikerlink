import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { users } from "@shared/db";
import { eq } from "drizzle-orm";
import { sendError } from "../../lib/api-response";

const router = Router();

router.get("/:userId", async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.userId);
    const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!rows.length) return sendError(res, 404, "Utente non trovato");
    const { password: _, ...safe } = rows[0];
    return res.json(safe);
  } catch (err) {
    console.error("[admin/users/:userId GET] error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.put("/:userId/telemetry-disabled", async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.userId);
    const { disabled } = req.body as { disabled?: unknown };
    if (typeof disabled !== "boolean") {
      return sendError(res, 400, "disabled deve essere un booleano");
    }
    await db
      .update(users)
      .set({ telemetryDisabled: disabled, updatedAt: new Date() })
      .where(eq(users.id, userId));
    return res.json({ userId, telemetryDisabled: disabled });
  } catch (err) {
    console.error("[admin/users/:userId/telemetry-disabled] error:", err);
    return sendError(res, 500, "Errore aggiornamento telemetry_disabled");
  }
});

router.put("/:userId/matching-disabled", async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.userId);
    const { matchingDisabled } = req.body as { matchingDisabled?: unknown };
    if (typeof matchingDisabled !== "boolean") {
      return sendError(res, 400, "matchingDisabled deve essere un booleano");
    }
    const result = await db
      .update(users)
      .set({ matchingDisabled, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    if (!result.length) return sendError(res, 404, "Utente non trovato");
    return res.json({ userId, matchingDisabled });
  } catch (err) {
    console.error("[admin/users/:userId/matching-disabled] error:", err);
    return sendError(res, 500, "Errore aggiornamento matching_disabled");
  }
});

export default router;

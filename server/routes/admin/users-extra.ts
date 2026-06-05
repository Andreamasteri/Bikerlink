import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { users } from "@shared/db";
import { eq } from "drizzle-orm";
import { sendError } from "../../lib/api-response";

const router = Router();

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

export default router;

import { Router, type Request, type Response } from "express";
import { db } from "../../../db";
import { users } from "@shared/db";
import { eq } from "drizzle-orm";
import { sendError } from "../../../lib/api-response";

const router = Router();

router.put("/users/:userId/map-tester", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params as { userId: string };
    const { enabled } = req.body as { enabled?: unknown };

    if (typeof enabled !== "boolean") {
      return sendError(res, 400, "enabled deve essere un booleano");
    }

    const [updated] = await db
      .update(users)
      .set({ mapTester: enabled, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id, mapTester: users.mapTester });

    if (!updated) {
      return sendError(res, 404, "Utente non trovato");
    }

    console.log(`[admin/maps/tester] userId=${userId} mapTester=${enabled}`);
    return res.json({ ok: true, userId, mapTester: enabled });
  } catch (err) {
    console.error("[admin/maps/tester] PUT error:", err);
    return sendError(res, 500, "Errore aggiornamento flag Map Tester");
  }
});

export default router;

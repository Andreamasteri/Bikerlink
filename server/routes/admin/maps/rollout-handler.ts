import { Router, type Request, type Response } from "express";
import { storage } from "../../../storage";
import { sendError } from "../../../lib/api-response";
import type { MapsRollout } from "@shared/maps-config";

const VALID_ROLLOUTS: MapsRollout[] = ["disabled", "tester", "all"];

const router = Router();

router.put("/rollout", async (req: Request, res: Response) => {
  try {
    const { rollout } = req.body as { rollout?: unknown };

    if (!rollout || !VALID_ROLLOUTS.includes(rollout as MapsRollout)) {
      return sendError(
        res,
        400,
        `rollout non valido. Valori ammessi: ${VALID_ROLLOUTS.join(", ")}`
      );
    }

    await storage.upsertAppSetting("maps_rollout", rollout as string);
    console.log(`[admin/maps/rollout] Rollout aggiornato a: ${rollout}`);

    return res.json({ ok: true, rollout });
  } catch (err) {
    console.error("[admin/maps/rollout] PUT error:", err);
    return sendError(res, 500, "Errore aggiornamento rollout");
  }
});

export default router;

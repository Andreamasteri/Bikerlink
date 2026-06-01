/**
 * settings.next.ts — file successore di settings.ts
 *
 * Contenuto:
 *   - GET /landing-images — lettura immagini landing page
 *   - POST /landing-images — salvataggio immagini landing page
 */

import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { bustLandingImagesCache } from "../../site/routes";
import { sendError } from "../../lib/api-response";

const router = Router();

router.get("/landing-images", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("landing_images");
    return res.json(setting?.value || []);
  } catch (_error) {
    return sendError(res, 500, "Errore lettura landing images");
  }
});

router.post("/landing-images", async (req: Request, res: Response) => {
  try {
    const images = req.body.images;
    if (!Array.isArray(images)) return sendError(res, 400, "Images deve essere un array");
    const setting = await storage.upsertAppSetting("landing_images", undefined, images);
    await bustLandingImagesCache();
    return res.json(setting);
  } catch (_error) {
    return sendError(res, 500, "Errore salvataggio landing images");
  }
});

export default router;

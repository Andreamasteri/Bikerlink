/**
 * settings.next.ts — file successore di settings.ts
 *
 * Contenuto:
 *   - GET /landing-images — lettura immagini landing page
 *   - POST /landing-images — salvataggio immagini landing page
 *   - GET /website-url — lettura URL sito web
 *   - PUT /website-url — salvataggio URL sito web
 *   - GET /maintenance — lettura modalità manutenzione
 *   - PUT /maintenance — salvataggio modalità manutenzione
 */

import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { bustLandingImagesCache } from "../../site/routes";
import { sendError } from "../../lib/api-response";
import { urlSettingSchema, maintenanceSettingsSchema } from "@shared/validators";

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

router.get("/website-url", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("website_url");
    return res.json({ url: setting?.value || "" });
  } catch (_error) {
    return sendError(res, 500, "Errore lettura Website URL");
  }
});

router.put("/website-url", async (req: Request, res: Response) => {
  try {
    const parsed = urlSettingSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const setting = await storage.upsertAppSetting("website_url", parsed.data.url);
    return res.json(setting);
  } catch (_error) {
    return sendError(res, 500, "Errore salvataggio Website URL");
  }
});

router.get("/maintenance", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("maintenance_settings");
    return res.json(setting?.value || { enabled: false, message: "" });
  } catch (_error) {
    return sendError(res, 500, "Errore lettura maintenance mode");
  }
});

router.put("/maintenance", async (req: Request, res: Response) => {
  try {
    const parsed = maintenanceSettingsSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const setting = await storage.upsertAppSetting("maintenance_settings", undefined, parsed.data);
    return res.json(setting);
  } catch (_error) {
    return sendError(res, 500, "Errore salvataggio maintenance mode");
  }
});

/**
 * GET /thinkcentre-service-push
 * Legge l'AppSetting "thinkcentre_service_push_enabled".
 * Default: true (notifiche per-servizio abilitate).
 */
router.get("/thinkcentre-service-push", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("thinkcentre_service_push_enabled");
    const enabled = setting?.value !== "false";
    return res.json({ enabled });
  } catch (_error) {
    return sendError(res, 500, "Errore lettura impostazione push ThinkCentre");
  }
});

/**
 * PUT /thinkcentre-service-push
 * Body: { enabled: boolean }
 * Scrive l'AppSetting "thinkcentre_service_push_enabled".
 */
router.put("/thinkcentre-service-push", async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return sendError(res, 400, "Campo 'enabled' deve essere un booleano");
    }
    await storage.upsertAppSetting("thinkcentre_service_push_enabled", enabled ? "true" : "false");
    return res.json({ ok: true, enabled });
  } catch (_error) {
    return sendError(res, 500, "Errore salvataggio impostazione push ThinkCentre");
  }
});

/**
 * GET /ais-config
 * Restituisce la configurazione AIS corrente (bbox, max_vessels, stato connessione).
 */
router.get("/ais-config", async (_req: Request, res: Response) => {
  try {
    const { getAisStatus, getVesselCount } = await import("../ais/relay");
    const [bboxSetting, maxVesselsSetting] = await Promise.all([
      storage.getAppSetting("aisstream_bbox"),
      storage.getAppSetting("ais_max_vessels"),
    ]);
    return res.json({
      bbox: bboxSetting?.value ?? process.env.AISSTREAM_BBOX ?? "",
      maxVessels: maxVesselsSetting?.value ?? process.env.MAX_VESSELS ?? "2000",
      status: getAisStatus(),
      vesselCount: getVesselCount(),
    });
  } catch (_error) {
    return sendError(res, 500, "Errore lettura config AIS");
  }
});

/**
 * PUT /ais-config
 * Body: { bbox?: string, maxVessels?: number }
 * Salva su AppSetting e riconnette il WebSocket AIS senza riavviare il server.
 */
router.put("/ais-config", async (req: Request, res: Response) => {
  try {
    const { reconnectAisStream } = await import("../ais/relay");
    const { bbox, maxVessels } = req.body as { bbox?: string; maxVessels?: number };

    if (bbox !== undefined && typeof bbox !== "string") {
      return sendError(res, 400, "bbox deve essere una stringa");
    }
    if (bbox !== undefined && bbox !== "") {
      const parts = bbox.split(",").map(Number);
      if (parts.length !== 4 || parts.some(isNaN)) {
        return sendError(res, 400, "bbox non valido — formato: minLat,minLon,maxLat,maxLon");
      }
      const [minLat, minLon, maxLat, maxLon] = parts;
      if (minLat < -90 || maxLat > 90 || minLon < -180 || maxLon > 180) {
        return sendError(res, 400, "bbox fuori range — lat: -90..90, lon: -180..180");
      }
      if (minLat >= maxLat || minLon >= maxLon) {
        return sendError(res, 400, "bbox non valido — minLat < maxLat e minLon < maxLon richiesti");
      }
    }
    if (maxVessels !== undefined && (typeof maxVessels !== "number" || !Number.isInteger(maxVessels) || maxVessels < 1)) {
      return sendError(res, 400, "maxVessels deve essere un numero intero positivo");
    }

    const upserts: Promise<unknown>[] = [];
    if (bbox !== undefined) {
      upserts.push(storage.upsertAppSetting("aisstream_bbox", bbox));
    }
    if (maxVessels !== undefined) {
      upserts.push(storage.upsertAppSetting("ais_max_vessels", String(maxVessels)));
    }
    await Promise.all(upserts);

    await reconnectAisStream(bbox, maxVessels);

    return res.json({ ok: true });
  } catch (_error) {
    console.error("[ais-config] save error:", _error);
    return sendError(res, 500, "Errore salvataggio config AIS");
  }
});

/**
 * POST /ais-reconnect
 * Riconnette il WebSocket AIS senza modificare la configurazione.
 */
router.post("/ais-reconnect", async (_req: Request, res: Response) => {
  try {
    const { reconnectAisStream } = await import("../ais/relay");
    await reconnectAisStream();
    return res.json({ ok: true });
  } catch (_error) {
    console.error("[ais-reconnect] error:", _error);
    return sendError(res, 500, "Errore riconnessione AIS");
  }
});

export default router;

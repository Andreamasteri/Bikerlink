import { Router, type Request, type Response } from "express";
import { storage } from "../../../storage";
import { sendError } from "../../../lib/api-response";
import { TILE_PROVIDERS, DEFAULT_TILE_PROVIDER_ID, findTileProvider } from "../../../../lib/maps/tile-providers";
import { getQuota, resetQuota } from "../../maps/quota-store";

const router = Router();

router.get("/providers", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("active_tile_provider");
    const activeId = setting?.value ?? DEFAULT_TILE_PROVIDER_ID;

    const providers = await Promise.all(
      TILE_PROVIDERS.map(async (p) => ({
        id: p.id,
        label: p.label,
        category: p.category,
        cost: p.cost,
        maxZoom: p.maxZoom,
        rendererCompat: p.rendererCompat,
        keyRequired: !!p.apiKeyEnvVar,
        keyAvailable: p.apiKeyEnvVar ? !!process.env[p.apiKeyEnvVar] : true,
        isActive: p.id === activeId,
        quotaThisMonth: await getQuota(p.id),
      })),
    );

    return res.json({ providers, activeId });
  } catch (err) {
    console.error("[admin/maps/providers] GET error:", err);
    return sendError(res, 500, "Errore caricamento provider tile");
  }
});

router.put("/providers/active", async (req: Request, res: Response) => {
  try {
    const { id } = req.body as { id?: unknown };

    if (!id || typeof id !== "string") {
      return sendError(res, 400, "id provider mancante");
    }

    const provider = findTileProvider(id);
    if (!provider) {
      const validIds = TILE_PROVIDERS.map((p) => p.id).join(", ");
      return sendError(res, 400, `Provider non valido. Valori ammessi: ${validIds}`);
    }

    await storage.upsertAppSetting("active_tile_provider", id);
    console.log(`[admin/maps/providers] Provider attivo aggiornato a: ${id}`);

    return res.json({ ok: true, activeId: id });
  } catch (err) {
    console.error("[admin/maps/providers] PUT error:", err);
    return sendError(res, 500, "Errore aggiornamento provider tile");
  }
});

router.post("/quota-reset/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };

    const provider = findTileProvider(id);
    if (!provider) {
      const validIds = TILE_PROVIDERS.map((p) => p.id).join(", ");
      return sendError(res, 400, `Provider non valido. Valori ammessi: ${validIds}`);
    }

    await resetQuota(id);
    return res.json({ ok: true, providerId: id, quotaThisMonth: 0 });
  } catch (err) {
    console.error("[admin/maps/providers] POST quota-reset error:", err);
    return sendError(res, 500, "Errore reset quota provider tile");
  }
});

export default router;

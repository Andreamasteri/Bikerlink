import { Router, type Request, type Response } from "express";
import { storage } from "../../../storage";
import { sendError } from "../../../lib/api-response";
import { TILE_PROVIDERS, DEFAULT_TILE_PROVIDER_ID, findTileProvider } from "../../../../lib/maps/tile-providers";
import { getQuota, resetQuota } from "../../maps/quota-store";
import { getStatus, resetStatus, ProviderStatus } from "../../maps/provider-status";

const router = Router();

router.get("/providers", async (req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("active_tile_provider");
    const activeId = setting?.value ?? DEFAULT_TILE_PROVIDER_ID;

    const platformFilter = req.query.platform as string | undefined;

    const filtered = platformFilter
      ? TILE_PROVIDERS.filter((p) => {
          if (p.archived) return false;
          return p.platform === platformFilter || p.platform === "both";
        })
      : TILE_PROVIDERS;

    const providers = await Promise.all(
      filtered.map(async (p) => {
        const [quota, status] = await Promise.all([getQuota(p.id), getStatus(p.id)]);
        return {
          id: p.id,
          label: p.label,
          description: p.description,
          category: p.category,
          cost: p.cost,
          maxZoom: p.maxZoom,
          rendererCompat: p.rendererCompat,
          keyRequired: !!p.apiKeyEnvVar,
          keyAvailable: p.apiKeyEnvVar ? !!process.env[p.apiKeyEnvVar] : true,
          isActive: p.id === activeId,
          quotaThisMonth: quota,
          status,
          platform: p.platform,
          archived: p.archived,
          note: p.note ?? null,
          tierLimited: p.tierLimited ?? false,
        };
      }),
    );

    const fallbackActive = providers.find((p) => p.isActive)?.status !== ProviderStatus.active;
    return res.json({ providers, activeId, fallback_active: fallbackActive });
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

    if (provider.archived) {
      return sendError(res, 400, `Il provider "${provider.label}" è archiviato e non può essere impostato come attivo.`);
    }

    if (provider.category === "overlay") {
      return sendError(res, 400, `Il provider "${provider.label}" è un overlay e non può essere impostato come provider base.`);
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

router.post("/status-reset/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };

    const provider = findTileProvider(id);
    if (!provider) {
      const validIds = TILE_PROVIDERS.map((p) => p.id).join(", ");
      return sendError(res, 400, `Provider non valido. Valori ammessi: ${validIds}`);
    }

    await resetStatus(id);
    return res.json({ ok: true, providerId: id, status: ProviderStatus.active });
  } catch (err) {
    console.error("[admin/maps/providers] POST status-reset error:", err);
    return sendError(res, 500, "Errore reset stato provider tile");
  }
});

export default router;

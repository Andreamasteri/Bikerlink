/**
 * Tile proxy — forwards tile requests to upstream providers.
 * Detects 429 (quota exceeded) and 5xx (unreachable) from upstream
 * and updates provider status accordingly.
 */

import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { DEFAULT_TILE_PROVIDER_ID, findTileProvider } from "../../../lib/maps/tile-providers";
import { resolveTileUrl } from "../../../lib/maps/tile-for-renderer";
import { markQuotaExceeded, markUnreachable } from "./provider-status";

const router = Router();

router.get("/tiles/:providerId/:z/:x/:y", async (req: Request, res: Response) => {
  const { providerId, z, x, y } = req.params as Record<string, string>;

  const provider = findTileProvider(providerId);
  if (!provider) {
    return res.status(404).json({ error: "Provider sconosciuto" });
  }

  if (provider.archived) {
    return res.status(404).json({ error: "Provider archiviato — non disponibile" });
  }

  let baseUrl = resolveTileUrl(provider);
  baseUrl = baseUrl
    .replace("{z}", z)
    .replace("{x}", x)
    .replace("{y}", y);

  try {
    const upstream = await fetch(baseUrl, {
      headers: { "User-Agent": "BikerLink/1.0 tile-proxy" },
      signal: AbortSignal.timeout(8000),
    });

    if (upstream.status === 429) {
      await markQuotaExceeded(providerId);
      res.setHeader("X-Tile-Fallback-Needed", "true");
      return res.status(503).json({ error: "Quota tile esaurita", fallbackNeeded: true });
    }

    if (upstream.status >= 500) {
      await markUnreachable(providerId);
      res.setHeader("X-Tile-Fallback-Needed", "true");
      return res.status(503).json({ error: "Provider irraggiungibile", fallbackNeeded: true });
    }

    if (!upstream.ok) {
      return res.status(upstream.status).end();
    }

    const contentType = upstream.headers.get("content-type") ?? "image/png";
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.status(200).send(buffer);
  } catch (err) {
    console.error(`[tile-proxy] Fetch error for ${providerId} (${baseUrl}):`, err);
    await markUnreachable(providerId);
    res.setHeader("X-Tile-Fallback-Needed", "true");
    return res.status(503).json({ error: "Provider irraggiungibile", fallbackNeeded: true });
  }
});

router.post("/tiles/:providerId/report-error", async (req: Request, res: Response) => {
  const { providerId } = req.params as { providerId: string };
  const { errorType } = req.body as { errorType?: string };

  const provider = findTileProvider(providerId);
  if (!provider) return res.status(404).json({ error: "Provider sconosciuto" });

  if (errorType === "quota") {
    await markQuotaExceeded(providerId);
  } else {
    await markUnreachable(providerId);
  }

  const setting = await storage.getAppSetting("active_tile_provider");
  const activeId = setting?.value ?? DEFAULT_TILE_PROVIDER_ID;

  return res.json({ ok: true, fallbackNeeded: activeId === providerId });
});

export default router;

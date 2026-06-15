/**
 * Tile proxy — forwards tile requests to upstream providers.
 * Detects 429 (quota exceeded) and 5xx (unreachable) from upstream
 * and updates provider status accordingly.
 *
 * The route requires an authenticated session. Anonymous callers receive
 * a 401 before any upstream fetch or API-key substitution occurs.
 * A per-user/IP rate limiter caps tile fetches to block scripted quota sweeps.
 *
 * Provider status (quota_exceeded / unreachable) is written exclusively here,
 * after the server has directly observed the upstream HTTP response.
 * There is no client-facing endpoint to assert provider status — such an
 * endpoint would allow any authenticated user to force a global map fallback
 * for all users with a single request.
 */

import { Router, type Request, type Response } from "express";
import { findTileProvider } from "../../../lib/maps/tile-providers";
import { resolveTileUrl } from "../../../lib/maps/tile-for-renderer";
import { markQuotaExceeded, markUnreachable } from "./provider-status";
import { requireAuth } from "../../lib/auth-middleware";
import {
  tileProxyRateLimiter,
  getTrustedClientIp,
} from "../../lib/abuse-rate-limit";

const router = Router();

router.get("/tiles/:providerId/:z/:x/:y", requireAuth, async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const ip = getTrustedClientIp(req);

  if (tileProxyRateLimiter.isOverLimit(userId, ip)) {
    return res.status(429).json({ error: "Troppo richieste — riprova tra un momento" });
  }

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

export default router;

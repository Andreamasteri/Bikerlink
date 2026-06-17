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
import { sendError } from "../../lib/api-response";

const router = Router();

/**
 * GET /api/maps/tile-proxy-check
 *
 * Endpoint di diagnostica leggero che verifica la raggiungibilità del tile server
 * di default (tile.openstreetmap.org). Usato dal runner di diagnostica client.
 * Risponde entro 3 secondi: se il tile server non è raggiungibile restituisce
 * HTTP 503 pulito invece di lasciare la connessione appesa.
 */
router.get("/maps/tile-proxy-check", requireAuth, async (_req: Request, res: Response) => {
  const testUrl = "https://tile.openstreetmap.org/0/0/0.png";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  const t0 = Date.now();

  try {
    const upstream = await fetch(testUrl, {
      headers: { "User-Agent": "BikerLink/1.0 tile-proxy-check" },
      signal: controller.signal,
    });

    const latencyMs = Date.now() - t0;

    if (!upstream.ok) {
      return res.status(503).json({ ok: false, latencyMs, error: `HTTP ${upstream.status}` });
    }

    return res.json({ ok: true, latencyMs });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[tile-proxy-check] error:", msg);
    return res.status(503).json({ ok: false, latencyMs: null, error: "Tile server non raggiungibile" });
  } finally {
    clearTimeout(timer);
  }
});

router.get("/tiles/:providerId/:z/:x/:y", requireAuth, async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const ip = getTrustedClientIp(req);

  if (tileProxyRateLimiter.isOverLimit(userId, ip)) {
    return sendError(res, 429, "Troppo richieste — riprova tra un momento");
  }

  const { providerId, z, x, y } = req.params as Record<string, string>;

  const provider = findTileProvider(providerId);
  if (!provider) {
    return sendError(res, 404, "Provider sconosciuto");
  }

  if (provider.archived) {
    return sendError(res, 404, "Provider archiviato — non disponibile");
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
      return res.status(503).json({ success: false, message: "Quota tile esaurita", fallbackNeeded: true });
    }

    if (upstream.status >= 500) {
      await markUnreachable(providerId);
      res.setHeader("X-Tile-Fallback-Needed", "true");
      return res.status(503).json({ success: false, message: "Provider irraggiungibile", fallbackNeeded: true });
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
    return res.status(503).json({ success: false, message: "Provider irraggiungibile", fallbackNeeded: true });
  }
});

export default router;

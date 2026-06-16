import { Router, Request, Response } from "express";
import { TILE_PROVIDERS } from "../../../../lib/maps/tile-providers";
import { sendError } from "../../../lib/api-response";

const router = Router();

const inMemoryCache = new Map<string, { data: Buffer; contentType: string; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function interpolateUrl(template: string, z: string, x: string, y: string, apiKey?: string): string {
  return template
    .replace(/\{z\}/g, z)
    .replace(/\{x\}/g, x)
    .replace(/\{y\}/g, y)
    .replace(/\{apiKey\}/g, apiKey ?? "")
    .replace(/\{apikey\}/g, apiKey ?? "");
}

router.get("/tile-preview/:providerId/:z/:x/:y", async (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  const z = req.params.z as string;
  const x = req.params.x as string;
  const y = req.params.y as string;

  const provider = TILE_PROVIDERS.find((p) => p.id === providerId);
  if (!provider) {
    return sendError(res, 404, "Provider not found");
  }

  let apiKey: string | undefined;
  if (provider.apiKeyEnvVar) {
    apiKey = process.env[provider.apiKeyEnvVar];
    if (!apiKey) {
      return res.status(200).json({ keyRequired: true });
    }
  }

  const tileUrl = interpolateUrl(provider.urlTemplate, z, x, y, apiKey);
  const cacheKey = `${providerId}:${z}:${x}:${y}`;

  const cached = inMemoryCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    res.set("Content-Type", cached.contentType);
    res.set("Cache-Control", "public, max-age=300");
    return res.send(cached.data);
  }

  try {
    const upstream = await fetch(tileUrl, {
      headers: { "User-Agent": "BikerLink/1.0 TileAdmin" },
      signal: AbortSignal.timeout(8000),
    });

    if (!upstream.ok) {
      return sendError(res, 502, `Upstream ${upstream.status}`);
    }

    const contentType = upstream.headers.get("content-type") ?? "image/png";
    const buffer = Buffer.from(await upstream.arrayBuffer());

    inMemoryCache.set(cacheKey, { data: buffer, contentType, ts: Date.now() });

    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=300");
    return res.send(buffer);
  } catch {
    return sendError(res, 502, "Fetch failed");
  }
});

export default router;

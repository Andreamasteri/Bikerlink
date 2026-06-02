/**
 * Admin — Route AI Providers
 *
 * GET  /api/admin/ai/route-providers         → stato di ciascun provider + chain attiva
 * GET  /api/admin/ai/route-providers/config  → chain salvata in DB (senza env override)
 * POST /api/admin/ai/route-providers/config  → aggiorna chain in DB
 *
 * Auth: _requireAdmin (già applicato dal router padre in admin.ts).
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { sendError } from "../../../lib/api-response";
import {
  getRouteProviderStatusList,
  setRouteProviderChain,
  ALL_ROUTE_PROVIDERS,
  DEFAULT_ROUTE_CHAIN,
  type RouteProviderId,
} from "../../../ai/route-provider-config";
import { storage } from "../../../storage";

const router = Router();

const DB_KEY = "ai_route_provider_chain";

// ── GET /ai/route-providers ──────────────────────────────────────────────────
router.get("/route-providers", async (_req: Request, res: Response) => {
  try {
    const data = await getRouteProviderStatusList();
    res.json(data);
  } catch (err) {
    console.error("[admin/ai/route-providers] GET error:", err);
    sendError(res, 500, (err as Error).message);
  }
});

// ── GET /ai/route-providers/config ───────────────────────────────────────────
router.get("/route-providers/config", async (_req: Request, res: Response) => {
  try {
    const row = await storage.getAppSetting(DB_KEY);
    const saved: RouteProviderId[] =
      row?.valueJson && Array.isArray(row.valueJson)
        ? (row.valueJson as string[]).filter((id): id is RouteProviderId =>
            ALL_ROUTE_PROVIDERS.includes(id as RouteProviderId),
          )
        : [];

    const envOverride = process.env.ROUTE_AI_PROVIDERS ?? null;
    res.json({
      chain: saved.length > 0 ? saved : DEFAULT_ROUTE_CHAIN,
      dbChain: saved,
      envOverride: envOverride && envOverride !== "auto" ? envOverride : null,
      default: DEFAULT_ROUTE_CHAIN,
    });
  } catch (err) {
    console.error("[admin/ai/route-providers/config] GET error:", err);
    sendError(res, 500, (err as Error).message);
  }
});

// ── POST /ai/route-providers/config ──────────────────────────────────────────
const ConfigBody = z.object({
  chain: z.array(z.enum(["ollama", "groq", "gemini"])).min(1),
});

router.post("/route-providers/config", async (req: Request, res: Response) => {
  const parsed = ConfigBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.issues[0].message);
    return;
  }

  try {
    await setRouteProviderChain(parsed.data.chain);
    const data = await getRouteProviderStatusList();
    res.json({ ok: true, ...data });
  } catch (err) {
    console.error("[admin/ai/route-providers/config] POST error:", err);
    sendError(res, 500, (err as Error).message);
  }
});

export default router;

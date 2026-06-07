/**
 * Hub Admin — Routing ad Aree (Task #3122)
 *
 * Endpoint admin per il sistema di routing "ad aree regionali" (un'istanza
 * GraphHopper per gruppo-nazioni, vedi shared/routing-areas.ts). Separato dal
 * routing hub generico (server/routes/admin/routing/index.ts).
 *
 * Montato su `/api/admin/routing-areas` (vedi server/routes/admin.ts):
 *   GET   /api/admin/routing-areas             → master toggle + elenco gruppi
 *   PATCH /api/admin/routing-areas/mode        → imposta il master toggle
 *   GET   /api/admin/routing-areas/metrics     → relay metriche ThinkCentre (cache 15s)
 *   PATCH /api/admin/routing-areas/:code/enabled → abilita/disabilita un gruppo
 */

import { Router, type Request, type Response } from "express";
import { SELF_HOSTED_BASE_URL, isSelfHosted } from "../../../graphhopper-client";
import {
  getRoutingAreaMode,
  setRoutingAreaMode,
  ROUTING_AREA_MODES,
  type RoutingAreaMode,
} from "../../../routing/routing-area-mode";
import { getAreaEnabledMap, setAreaEnabled } from "../../../routing/routing-area-state";
import {
  ROUTING_AREAS,
  getRoutingArea,
  type RoutingAreaCode,
} from "@shared/routing-areas";

const router = Router();

/** Cache breve della relay metriche ThinkCentre per non martellare il server di casa. */
let areaMetricsCache: { at: number; data: unknown } | null = null;
const AREA_METRICS_TTL_MS = 15_000;

/**
 * GET / — master toggle (mode) + elenco gruppi con stato abilitato.
 */
router.get("/", async (_req: Request, res: Response) => {
  const [mode, enabledMap] = await Promise.all([getRoutingAreaMode(), getAreaEnabledMap()]);
  const areas = ROUTING_AREAS.map((a) => ({
    codice: a.codice,
    nome: a.nome,
    tier: a.tier,
    nazioni: a.nazioni.map((n) => ({ iso: n.iso, nome: n.nome })),
    abilitatoDefault: a.abilitatoDefault,
    enabled: enabledMap[a.codice] ?? false,
    pbfApproxGb: a.pbfApproxGb,
    serveHeapMb: a.serveHeapMb,
  }));
  return res.json({ mode, selfHosted: isSelfHosted, areas });
});

/**
 * PATCH /mode — imposta il master toggle (disabled|tester|enabled).
 */
router.patch("/mode", async (req: Request, res: Response) => {
  const { mode } = req.body ?? {};
  if (!(ROUTING_AREA_MODES as string[]).includes(mode)) {
    return res.status(400).json({
      ok: false,
      message: `Campo 'mode' deve essere uno di: ${ROUTING_AREA_MODES.join(", ")}.`,
    });
  }
  await setRoutingAreaMode(mode as RoutingAreaMode);
  return res.json({ ok: true, mode });
});

/**
 * GET /metrics — relay (cache 15s) delle metriche per-area esposte dal
 * ThinkCentre su `${SELF_HOSTED_BASE_URL}/metrics/areas`, autenticate via
 * X-GH-Token. Non espone mai il token al client admin.
 */
router.get("/metrics", async (_req: Request, res: Response) => {
  if (!isSelfHosted || !SELF_HOSTED_BASE_URL) {
    return res.json({ available: false, reason: "not_self_hosted", areas: [] });
  }
  if (areaMetricsCache && Date.now() - areaMetricsCache.at < AREA_METRICS_TTL_MS) {
    return res.json(areaMetricsCache.data);
  }
  const token = process.env.GRAPHHOPPER_TOKEN ?? "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const upstream = await fetch(`${SELF_HOSTED_BASE_URL}/metrics/areas`, {
      headers: token ? { "X-GH-Token": token } : {},
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!upstream.ok) {
      return res.status(502).json({ available: false, reason: `http_${upstream.status}`, areas: [] });
    }
    const data = await upstream.json().catch(() => ({}));
    const payload = { available: true, ...(data as Record<string, unknown>) };
    areaMetricsCache = { at: Date.now(), data: payload };
    return res.json(payload);
  } catch (err: unknown) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(502).json({
      available: false,
      reason: "unreachable",
      error: msg.slice(0, 200),
      areas: [],
    });
  }
});

/**
 * PATCH /:code/enabled — abilita/disabilita un singolo gruppo-area.
 * Il watchdog sul ThinkCentre lo rileva al prossimo polling e avvia/ferma il container.
 */
router.patch("/:code/enabled", async (req: Request, res: Response) => {
  const code = String(req.params.code);
  const { enabled } = req.body ?? {};
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ ok: false, message: "Campo 'enabled' (boolean) richiesto." });
  }
  if (!getRoutingArea(code)) {
    return res.status(404).json({ ok: false, message: `Area sconosciuta: ${code}` });
  }
  const map = await setAreaEnabled(code as RoutingAreaCode, enabled);
  return res.json({ ok: true, code, enabled, areas: map });
});

export default router;

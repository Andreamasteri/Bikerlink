/**
 * Endpoint pubblico Routing ad Aree — BikerLink (Task #3122)
 *
 * Espone lo stato abilitato dei gruppi-area al watchdog del ThinkCentre, così il
 * server di casa sa quali istanze GraphHopper tenere accese. È gated da
 * X-GH-Token (lo stesso token del self-hosted): se il token non è configurato
 * lato app l'endpoint resta aperto (ambienti senza self-host).
 *
 *   GET /api/routing/areas/status → { areas: [{ code, enabled }] }
 */
import { Router, type Request, type Response } from "express";
import { ROUTING_AREAS } from "@shared/routing-areas";
import { getAreaEnabledMap } from "../routing/routing-area-state";
import { sendError } from "../lib/api-response";

const router = Router();

const EXPECTED_TOKEN = process.env.GRAPHHOPPER_TOKEN ?? "";

router.get("/areas/status", async (req: Request, res: Response) => {
  if (EXPECTED_TOKEN) {
    const provided = req.get("X-GH-Token");
    if (provided !== EXPECTED_TOKEN) {
      return sendError(res, 401, "unauthorized");
    }
  }
  const map = await getAreaEnabledMap();
  return res.json({
    areas: ROUTING_AREAS.map((a) => ({ code: a.codice, enabled: map[a.codice] ?? false })),
  });
});

export default router;

/**
 * Endpoint pubblico Routing ad Aree — BikerLink (Task #3122)
 *
 * Espone lo stato abilitato dei gruppi-area al watchdog del ThinkCentre, così il
 * server di casa sa quali istanze GraphHopper tenere accese. È gated da
 * X-GH-Token (lo stesso token del self-hosted): se il token non è configurato
 * lato app l'endpoint resta aperto (ambienti senza self-host).
 *
 *   GET /api/routing/areas/status → { areas: [{ code, enabled }] }
 *
 * Espone anche un proxy Photon leggero per la diagnostica client:
 *   GET /api/routing/photon/search?q=<query>&limit=<n>
 *   → 200 { results: [...] } oppure 503 { error: "..." } entro 4 secondi.
 *   Garantisce che ThinkCentre offline non lasci il backend appeso.
 */
import { Router, type Request, type Response } from "express";
import { ROUTING_AREAS } from "@shared/routing-areas";
import { getAreaEnabledMap } from "../routing/routing-area-state";
import { sendError } from "../lib/api-response";
import { cfAccessHeaders } from "../lib/cf-access";

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

/**
 * GET /api/routing/photon/search
 *
 * Proxy leggero verso Photon self-hosted usato dalla diagnostica client per
 * verificare che il geocoding funzioni. SOLO self-hosted: nessun fallback
 * pubblico. Risponde entro 4 secondi: se Photon non è configurato o non è
 * raggiungibile (ThinkCentre offline) restituisce HTTP 503 invece di lasciare
 * la fetch appesa, evitando crash del backend.
 */
router.get("/photon/search", async (req: Request, res: Response) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) {
    return sendError(res, 400, "Parametro q richiesto");
  }

  const limitRaw = parseInt(String(req.query.limit ?? "5"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(10, Math.max(1, limitRaw)) : 5;

  const photonBase = process.env.PHOTON_URL?.trim().replace(/\/$/, "");
  if (!photonBase) {
    return res.status(503).json({ error: "Photon non configurato (PHOTON_URL mancante)", results: [] });
  }
  const token = process.env.PHOTON_TOKEN ?? "";

  const headers: Record<string, string> = {
    "User-Agent": "BikerLink/4.0 (info@bikerlink.it)",
    ...cfAccessHeaders(),
  };
  if (token) {
    headers["X-Photon-Token"] = token;
  }

  const url =
    `${photonBase}/api/?q=${encodeURIComponent(q)}&limit=${limit}&lang=default`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_000);

  try {
    const upstream = await fetch(url, { headers, signal: controller.signal });
    if (!upstream.ok) {
      return res.status(503).json({ error: `Photon HTTP ${upstream.status}`, results: [] });
    }
    const data = await upstream.json();
    return res.json({ results: data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[routing/photon/search] error:", msg);
    return res.status(503).json({ error: "Photon non raggiungibile", results: [] });
  } finally {
    clearTimeout(timer);
  }
});

export default router;

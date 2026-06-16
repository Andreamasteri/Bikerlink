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
 * Espone anche un proxy Nominatim leggero per la diagnostica client:
 *   GET /api/routing/nominatim/search?q=<query>&limit=<n>
 *   → 200 { results: [...] } oppure 503 { error: "..." } entro 4 secondi.
 *   Garantisce che ThinkCentre offline non lasci il backend appeso.
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

/**
 * GET /api/routing/nominatim/search
 *
 * Proxy leggero verso Nominatim (self-hosted o pubblico) usato dalla diagnostica
 * client per verificare che il geocoding funzioni. Risponde entro 4 secondi:
 * se il server Nominatim non è raggiungibile (ThinkCentre offline) restituisce
 * HTTP 503 invece di lasciare la fetch appesa, evitando crash del backend.
 */
router.get("/nominatim/search", async (req: Request, res: Response) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) {
    return sendError(res, 400, "Parametro q richiesto");
  }

  const limitRaw = parseInt(String(req.query.limit ?? "5"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(10, Math.max(1, limitRaw)) : 5;

  const nominatimBase = process.env.NOMINATIM_URL?.trim().replace(/\/$/, "")
    || "https://nominatim.openstreetmap.org";
  const token = process.env.NOMINATIM_TOKEN ?? "";
  const isSelfHosted = Boolean(process.env.NOMINATIM_URL?.trim());

  const headers: Record<string, string> = {
    "User-Agent": "BikerLink/4.0 (info@bikerlink.it)",
  };
  if (isSelfHosted && token) {
    headers["X-Nominatim-Token"] = token;
  }

  const url =
    `${nominatimBase}/search?q=${encodeURIComponent(q)}&format=json&limit=${limit}&accept-language=it`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_000);

  try {
    const upstream = await fetch(url, { headers, signal: controller.signal });
    if (!upstream.ok) {
      return res.status(503).json({ error: `Nominatim HTTP ${upstream.status}`, results: [] });
    }
    const data = await upstream.json();
    return res.json({ results: data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[routing/nominatim/search] error:", msg);
    return res.status(503).json({ error: "Nominatim non raggiungibile", results: [] });
  } finally {
    clearTimeout(timer);
  }
});

export default router;

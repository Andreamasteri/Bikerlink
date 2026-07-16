/**
 * Valhalla — Status, Bench multi-percorso, Attivazione (Admin)
 *
 *   GET  /api/admin/maps/valhalla-status   → { configured, ok, version, osm_date, url_hint }
 *   POST /api/admin/maps/valhalla-bench    → 7 percorsi moto su Valhalla vs distanze di riferimento
 *   POST /api/admin/maps/activate-valhalla → maps_rollout=all + maps_routing_engine=valhalla (atomico)
 *
 * Il bench confronta Valhalla contro distanze di riferimento HARDCODED
 * (misurate una volta su GraphHopper self-hosted per-area, 2026-07-16) invece
 * di chiamare GraphHopper live: così un GH offline non fa mai apparire
 * Valhalla come "non attivabile" (0/7). groundTruth: "hardcoded_reference".
 */

import { Router, type Request, type Response } from "express";
import { storage } from "../../../storage";
import { sendError } from "../../../lib/api-response";
import { calculateRoute as valhallaCalculateRoute, getInfo as getValhallaInfo } from "../../../routing/valhalla-client";
import type { RouteRequest } from "../../../routing/graphhopper-adapter";

const router = Router();

/** Soglia massima di delta distanza per considerare un percorso "passato". */
const PASS_DELTA_PCT = 8;
/** Numero minimo di percorsi che devono passare per abilitare l'attivazione. */
const MIN_PASS_FOR_ACTIVATION = 5;

interface BenchRoute {
  id: string;
  name: string;
  points: [number, number][]; // [lng, lat] (formato interno)
  /** Distanza di riferimento (km) — misurata una volta su GH self-hosted (area arco-alpino), 2026-07-16. */
  referenceKm: number;
  /** Durata di riferimento (min) — informativa, non usata per il pass. */
  referenceMin: number;
}

/**
 * 7 percorsi moto italiani noti. Coordinate in [lng, lat].
 */
const BENCH_ROUTES: BenchRoute[] = [
  {
    id: "mira-stelvio",
    name: "Mira → Stelvio (via Bormio)",
    points: [
      [12.128, 45.43],   // Mira (VE)
      [10.37, 46.467],   // Bormio (SO)
      [10.4527, 46.5286], // Passo dello Stelvio
    ],
    referenceKm: 299.2,
    referenceMin: 356,
  },
  {
    id: "garda-ovest",
    name: "Garda Ovest (Salò → Tremosine → Limone)",
    points: [
      [10.521, 45.606],  // Salò (BS)
      [10.78, 45.787],   // Tremosine sul Garda
      [10.792, 45.813],  // Limone sul Garda
    ],
    referenceKm: 33.7,
    referenceMin: 42,
  },
  {
    id: "dolomiti",
    name: "Dolomiti (Bolzano → Cortina)",
    points: [
      [11.354, 46.498],  // Bolzano
      [12.135, 46.537],  // Cortina d'Ampezzo
    ],
    referenceKm: 98.7,
    referenceMin: 110,
  },
  {
    id: "langhe",
    name: "Langhe (Alba → Barolo → Cherasco)",
    points: [
      [8.035, 44.700],   // Alba
      [7.943, 44.611],   // Barolo
      [7.857, 44.643],   // Cherasco
    ],
    referenceKm: 28.2,
    referenceMin: 45,
  },
  {
    id: "valle-aosta",
    name: "Valle d'Aosta (Aosta → Courmayeur)",
    points: [
      [7.320, 45.737],   // Aosta
      [6.974, 45.793],   // Courmayeur
    ],
    referenceKm: 38.2,
    referenceMin: 53,
  },
  {
    id: "toscana-costa",
    name: "Toscana costa (Livorno → Piombino)",
    points: [
      [10.308, 43.548],  // Livorno
      [10.524, 42.926],  // Piombino
    ],
    referenceKm: 82.2,
    referenceMin: 105,
  },
  {
    id: "sicilia",
    name: "Sicilia (Palermo → Cefalù)",
    points: [
      [13.361, 38.115],  // Palermo
      [14.022, 38.039],  // Cefalù
    ],
    referenceKm: 72.3,
    referenceMin: 99,
  },
];

/** Maschera l'URL Valhalla esponendo solo protocollo + host (no path/credenziali). */
function maskHost(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.port ? ":" + u.port : ""}`;
  } catch {
    return url.slice(0, 40);
  }
}

interface EngineRunResult {
  ok: boolean;
  distanceKm: number | null;
  durationMin: number | null;
  latencyMs: number;
  error?: string;
}

async function runEngine(
  fn: (req: RouteRequest) => Promise<{ paths: Array<{ distance: number; time: number }> }>,
  req: RouteRequest,
): Promise<EngineRunResult> {
  const start = Date.now();
  try {
    const result = await fn(req);
    const latencyMs = Date.now() - start;
    const path = result.paths[0];
    if (!path) {
      return { ok: false, distanceKm: null, durationMin: null, latencyMs, error: "Nessun percorso restituito" };
    }
    return {
      ok: true,
      distanceKm: Math.round(path.distance / 100) / 10,
      durationMin: Math.round(path.time / 60000),
      latencyMs,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, distanceKm: null, durationMin: null, latencyMs, error: msg.slice(0, 200) };
  }
}

function pctDelta(a: number | null, b: number | null): number | null {
  if (a == null || b == null || a === 0) return null;
  return Math.round((Math.abs(b - a) / a) * 1000) / 10;
}

/**
 * GET /valhalla-status — stato di configurazione + connettività Valhalla.
 */
router.get("/valhalla-status", async (_req: Request, res: Response) => {
  const url = process.env.VALHALLA_URL?.replace(/\/$/, "") ?? "";
  const configured = url.length > 0;

  if (!configured) {
    return res.json({
      configured: false,
      ok: false,
      version: null,
      osm_date: null,
      url_hint: null,
    });
  }

  const info = await getValhallaInfo().catch(() => ({ status: "error", version: "probe failed" }));
  return res.json({
    configured: true,
    ok: info.status === "ok",
    version: info.version ?? null,
    osm_date: (info as { osm_date?: string }).osm_date ?? null,
    url_hint: maskHost(url),
  });
});

/**
 * POST /valhalla-bench — esegue i 7 percorsi su entrambi gli engine in parallelo.
 */
router.post("/valhalla-bench", async (_req: Request, res: Response) => {
  const url = process.env.VALHALLA_URL?.replace(/\/$/, "") ?? "";
  if (!url) {
    return sendError(res, 409, "VALHALLA_URL non configurato: imposta il secret prima di eseguire il bench.");
  }

  const buildReq = (points: [number, number][]): RouteRequest => ({
    points,
    profile: "motorcycle",
    instructions: false,
    calc_points: true,
    points_encoded: false,
    elevation: false,
  });

  const results = await Promise.all(
    BENCH_ROUTES.map(async (route) => {
      const req = buildReq(route.points);
      const valhalla = await runEngine(valhallaCalculateRoute, req);

      // Riferimento hardcoded (nessuna chiamata a GraphHopper): un GH offline
      // non può più azzerare il bench. Esposto nel campo "gh" per compatibilità
      // con la UI esistente (colonna "km rif.").
      const gh: EngineRunResult = {
        ok: true,
        distanceKm: route.referenceKm,
        durationMin: route.referenceMin,
        latencyMs: 0,
      };

      const deltaDistancePct = pctDelta(route.referenceKm, valhalla.distanceKm);
      const deltaTimePct = pctDelta(route.referenceMin, valhalla.durationMin);
      const pass =
        valhalla.ok &&
        deltaDistancePct != null &&
        deltaDistancePct < PASS_DELTA_PCT;

      return {
        id: route.id,
        name: route.name,
        gh,
        valhalla,
        deltaDistancePct,
        deltaTimePct,
        pass,
      };
    }),
  );

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;

  return res.json({
    ok: true,
    groundTruth: "hardcoded_reference",
    passDeltaPct: PASS_DELTA_PCT,
    minPassForActivation: MIN_PASS_FOR_ACTIVATION,
    score: { passed, total },
    canActivate: passed >= MIN_PASS_FOR_ACTIVATION,
    results,
  });
});

/**
 * POST /activate-valhalla — promuove Valhalla a engine attivo per tutti.
 * Nessun rollback automatico: la decisione finale spetta all'admin.
 */
router.post("/activate-valhalla", async (req: Request, res: Response) => {
  const info = await getValhallaInfo().catch(() => ({ status: "error", version: "probe failed" }));
  if (info.status !== "ok") {
    return sendError(
      res,
      409,
      `Valhalla non raggiungibile (status=${info.status}): impossibile attivare un engine offline.`,
    );
  }

  const [engineSetting, rolloutSetting] = await Promise.all([
    storage.getAppSetting("maps_routing_engine"),
    storage.getAppSetting("maps_rollout"),
  ]);
  const previousEngine = engineSetting?.value ?? "graphhopper";
  const previousRollout = rolloutSetting?.value ?? "disabled";

  await storage.upsertAppSettingsAtomic([
    { key: "maps_routing_engine", value: "valhalla" },
    { key: "maps_rollout", value: "all" },
  ]);

  const adminUser = (req as Request & { currentUser?: { id?: string; username?: string } }).currentUser;
  const adminLabel = adminUser?.username ?? adminUser?.id ?? "unknown";
  console.log(
    `[admin/maps/activate-valhalla] Valhalla attivato per tutti — admin=${adminLabel} ` +
      `previous_engine=${previousEngine} previous_rollout=${previousRollout} at=${new Date().toISOString()}`,
  );

  return res.json({
    ok: true,
    previous_engine: previousEngine,
    previous_rollout: previousRollout,
  });
});

export default router;

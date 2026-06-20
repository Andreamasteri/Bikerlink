/**
 * Route Weights — BikerLink
 *
 * Costruisce i pesi (custom_model.priority) di GraphHopper per la pianificazione
 * percorsi, separando nettamente due strati:
 *
 *  1. GEOMETRICO (base stabile, sempre disponibile)
 *     Pesi basati sulla classe stradale OSM (`road_class`), indipendenti da
 *     qualunque dato telemetrico. È il fallback universale: funziona per tutti
 *     gli utenti anche senza alcuna telemetria.
 *
 *  2. TELEMETRICO (strato opzionale)
 *     Boost per-segmento basato sul `curvy_score` reale (calcolato dai job dalla
 *     telemetria di piega/G-force) collegato all'encoded value `osm_way_id`.
 *     Applicato SOLO quando i dati sono presenti e validi (vedi criteri sotto),
 *     altrimenti si ricade automaticamente sul geometrico con warning.
 *
 * Criteri di validità telemetria (step 1):
 *  - per-segmento: `curvy_score >= TELEMETRY_ROUTING_MIN_SCORE` e
 *    `sample_count >= CURVY_SCORE_MIN_SAMPLES` (riuso soglia campioni del job);
 *  - copertura: almeno `TELEMETRY_ROUTING_MIN_SEGMENTS` segmenti qualificati
 *    presenti nei dati di comunità, altrimenti `insufficient_data`;
 *  - "my_style": in più richiede che l'utente abbia raggiunto la soglia km
 *    (`telemetry_target_km`) e abbia un `avgLeanAngle` valido.
 *
 * Configurazione (env):
 *   TELEMETRY_ROUTING_MIN_SCORE     — score minimo per boostare un segmento (default 45)
 *   TELEMETRY_ROUTING_MIN_SEGMENTS  — segmenti qualificati minimi per applicare (default 12)
 *   TELEMETRY_ROUTING_MAX_SEGMENTS  — numero massimo di segmenti boostati (default 60)
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { getCurvyScoreWeights, getUserStyleProfile } from "../curvy-score-job";
import { storage } from "../storage";

export type RouteStyle = "direct" | "fast" | "balanced" | "curvy" | "extra_curvy";
export type DrivingProfile = "geometric" | "real" | "my_style";

export interface PriorityRule {
  if: string;
  multiply_by: number;
}

export interface GeometricWeights {
  priority: PriorityRule[];
  distanceInfluence?: number;
}

/**
 * Motivo esplicito dello stato del cold-start telemetrico. Separa nettamente i
 * casi che prima erano collassati nel binario `insufficient_data`:
 *  - `not_applicable`            — profilo geometrico (telemetria non richiesta)
 *  - `no_community_data`         — non esiste ALCUN dato curvy_score nella community
 *  - `route_coverage_insufficient` — esistono dati, ma non abbastanza su QUESTA rotta
 *  - `user_km_below_target`      — (my_style) l'utente non ha ancora i km richiesti
 *  - `engine_unsupported`        — il motore di routing ha rifiutato le regole telemetriche
 *  - `applied`                   — strato telemetrico effettivamente applicato
 */
export type TelemetryCoverageReason =
  | "not_applicable"
  | "no_community_data"
  | "route_coverage_insufficient"
  | "user_km_below_target"
  | "engine_unsupported"
  | "applied";

/** Stato di copertura strutturato per surfacing del cold-start lato client. */
export interface TelemetryCoverage {
  reason: TelemetryCoverageReason;
  /** Segmenti del percorso con telemetria valida (curvy_score qualificato). */
  coveredSegments: number;
  /** Segmenti coperti necessari perché lo strato si applichi. */
  requiredSegments: number;
  /** Segmenti totali del percorso considerati (osm_way_id univoci). */
  routeSegments: number;
  /** my_style: km accumulati dall'utente (null se non pertinente). */
  userKm: number | null;
  /** my_style: km target da raggiungere (null se non pertinente). */
  targetKm: number | null;
}

export interface TelemetryWeights {
  /** Regole di boost per-segmento da unire alla priority geometrica. */
  priority: PriorityRule[];
  /** true se lo strato telemetrico è stato effettivamente applicato. */
  applied: boolean;
  /** "insufficient_data" quando si ricade sul geometrico, altrimenti null. */
  warning: string | null;
  /** Stato di copertura strutturato (cold-start esplicito). */
  coverage: TelemetryCoverage;
}

const STYLE_FALLBACK: RouteStyle = "curvy";

/** Normalizza uno style ricevuto dal client su uno dei 5 valori supportati. */
export function normalizeStyle(style: string | undefined): RouteStyle {
  switch (style) {
    case "direct":
    case "fast":
    case "balanced":
    case "curvy":
    case "extra_curvy":
      return style;
    default:
      return STYLE_FALLBACK;
  }
}

/** Normalizza un drivingProfile su uno dei 3 valori supportati. */
export function normalizeDrivingProfile(profile: string | undefined): DrivingProfile {
  switch (profile) {
    case "geometric":
    case "real":
    case "my_style":
      return profile;
    default:
      return "geometric";
  }
}

/**
 * Step 2 — Pesi geometrici stabili in base alla classe stradale OSM.
 * Indipendenti da qualunque dato telemetrico: è il fallback universale.
 */
export function buildGeometricWeights(
  style: RouteStyle,
  opts: { avoidHighways: boolean },
): GeometricWeights {
  const { avoidHighways } = opts;
  const priority: PriorityRule[] = [];
  let distanceInfluence: number | undefined;

  switch (style) {
    case "direct":
      // Percorso più diretto: predilige grandi arterie e minimizza la distanza.
      priority.push(
        { if: "road_class == MOTORWAY", multiply_by: avoidHighways ? 0.0 : 1.0 },
        { if: "road_class == TRUNK", multiply_by: 1.0 },
        { if: "road_class == PRIMARY", multiply_by: 0.95 },
        { if: "road_class == SECONDARY", multiply_by: 0.8 },
        { if: "road_class == TERTIARY", multiply_by: 0.6 },
        { if: "road_class == RESIDENTIAL", multiply_by: 0.4 },
        { if: "road_class == TRACK", multiply_by: 0.3 },
      );
      distanceInfluence = 200;
      break;

    case "fast":
      // Più veloce in tempo: nessuna penalità sulle curve.
      if (avoidHighways) {
        priority.push({ if: "road_class == MOTORWAY", multiply_by: 0.0 });
      }
      break;

    case "balanced":
      priority.push(
        { if: "road_class == MOTORWAY", multiply_by: avoidHighways ? 0.0 : 0.4 },
        { if: "road_class == SECONDARY", multiply_by: 1.1 },
      );
      break;

    case "curvy":
      priority.push(
        { if: "road_class == MOTORWAY", multiply_by: avoidHighways ? 0.0 : 0.1 },
        { if: "road_class == TRUNK", multiply_by: 0.2 },
        { if: "road_class == PRIMARY", multiply_by: 0.5 },
        { if: "road_class == SECONDARY", multiply_by: 1.0 },
        { if: "road_class == TERTIARY", multiply_by: 1.2 },
        { if: "road_class == UNCLASSIFIED", multiply_by: 1.1 },
      );
      break;

    case "extra_curvy":
      // Massimizza le curve: penalizza forte le grandi arterie, premia le
      // strade secondarie e tortuose.
      priority.push(
        { if: "road_class == MOTORWAY", multiply_by: avoidHighways ? 0.0 : 0.05 },
        { if: "road_class == TRUNK", multiply_by: 0.1 },
        { if: "road_class == PRIMARY", multiply_by: 0.3 },
        { if: "road_class == SECONDARY", multiply_by: 0.7 },
        { if: "road_class == TERTIARY", multiply_by: 1.4 },
        { if: "road_class == UNCLASSIFIED", multiply_by: 1.3 },
        { if: "road_class == RESIDENTIAL", multiply_by: 1.0 },
      );
      break;
  }

  return { priority, distanceInfluence };
}

function envInt(name: string, def: number): number {
  const v = parseInt(process.env[name] ?? String(def), 10);
  return Number.isFinite(v) && v > 0 ? v : def;
}

function envFloat(name: string, def: number): number {
  const v = parseFloat(process.env[name] ?? String(def));
  return Number.isFinite(v) && v > 0 ? v : def;
}

/**
 * Estrae gli `osm_way_id` percorsi da un path GraphHopper (richiesto con
 * `details: ["osm_way_id"]`). I details hanno forma `[[from, to, value], ...]`
 * dove `value` è l'id OSM del tratto. Restituisce gli id univoci del percorso.
 */
export function extractRouteWayIds(
  path: { details?: Record<string, unknown> } | undefined | null,
): number[] {
  const raw = path?.details?.osm_way_id;
  if (!Array.isArray(raw)) return [];
  const ids = new Set<number>();
  for (const entry of raw) {
    if (Array.isArray(entry) && entry.length >= 3) {
      const v = Number(entry[2]);
      if (Number.isFinite(v) && v > 0) ids.add(Math.trunc(v));
    }
  }
  return [...ids];
}

/**
 * Step 1 + 3 + 4 — Strato telemetrico opzionale, valutato SUL PERCORSO richiesto.
 *
 * Per i profili "real" e "my_style" collega il `curvy_score` reale dei segmenti
 * effettivamente attraversati dal percorso (encoded value `osm_way_id`) ai pesi
 * del routing, premiando i tratti con punteggio reale più alto.
 *
 * La validità è misurata sulla COPERTURA del percorso: si applica solo se un
 * numero sufficiente di segmenti del percorso ha telemetria valida
 * (vedi `TELEMETRY_ROUTING_MIN_ROUTE_SEGMENTS` + `TELEMETRY_ROUTING_MIN_COVERAGE`).
 * Altrimenti restituisce `applied=false` + `warning="insufficient_data"` così il
 * chiamante mantiene il percorso geometrico di base.
 *
 * @param profile      profilo di guida selezionato
 * @param userId       utente corrente (necessario per "my_style")
 * @param routeWayIds  osm_way_id attraversati dal percorso geometrico di base
 */
export async function buildTelemetryWeightsForRoute(
  profile: DrivingProfile,
  userId: string,
  routeWayIds: number[],
): Promise<TelemetryWeights> {
  if (profile === "geometric") {
    return {
      priority: [],
      applied: false,
      warning: null,
      coverage: emptyCoverage("not_applicable"),
    };
  }

  const minScore = envInt("TELEMETRY_ROUTING_MIN_SCORE", 45);
  const minRouteSegments = envInt("TELEMETRY_ROUTING_MIN_ROUTE_SEGMENTS", 2);
  const minCoverage = envFloat("TELEMETRY_ROUTING_MIN_COVERAGE", 0.05);
  const maxSegments = envInt("TELEMETRY_ROUTING_MAX_SEGMENTS", 80);
  const { minSamples } = getCurvyScoreWeights();

  // Metriche di copertura del percorso (note prima di interrogare il DB).
  const ids = routeWayIds.filter((n) => Number.isFinite(n)).map((n) => Math.trunc(n));
  const routeSegments = ids.length;
  const required = Math.max(minRouteSegments, Math.ceil(routeSegments * minCoverage));

  // Scala del boost: per "real" è neutra (1.0). Per "my_style" dipende dallo
  // stile del biker (lean angle medio) ed è gated sulla soglia km.
  let styleScale = 1.0;
  let userKm: number | null = null;
  let targetKm: number | null = null;
  if (profile === "my_style") {
    const [uProfile, targetKmSetting] = await Promise.all([
      getUserStyleProfile(userId),
      storage.getAppSetting("telemetry_target_km"),
    ]);
    targetKm = parseInt(targetKmSetting?.value ?? "400", 10);
    userKm = uProfile?.totalKm ?? 0;
    if (userKm < targetKm || !uProfile?.avgLeanAngle) {
      // Soglia km utente non raggiunta: stato esplicito col progresso verso il target.
      return {
        priority: [],
        applied: false,
        warning: "insufficient_data",
        coverage: {
          reason: "user_km_below_target",
          coveredSegments: 0,
          requiredSegments: required,
          routeSegments,
          userKm,
          targetKm,
        },
      };
    }
    // Biker aggressivo (lean alto) → boost più marcato sui tratti curvy reali.
    styleScale = Math.min(1.4, Math.max(0.9, uProfile.avgLeanAngle / 25));
  }

  // Nessun segmento nel percorso (es. details non disponibili): non possiamo
  // valutare la copertura → fallback geometrico esplicito.
  if (routeSegments === 0) {
    return {
      priority: [],
      applied: false,
      warning: "insufficient_data",
      coverage: {
        reason: "route_coverage_insufficient",
        coveredSegments: 0,
        requiredSegments: required,
        routeSegments: 0,
        userKm,
        targetKm,
      },
    };
  }

  let rows: { osm_way_id: string; curvy_score: string }[] = [];
  try {
    const result = await db.execute<{ osm_way_id: string; curvy_score: string }>(
      sql`
        SELECT osm_way_id::text AS osm_way_id, curvy_score::text AS curvy_score
        FROM segment_telemetry
        WHERE osm_way_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
          AND curvy_score IS NOT NULL
          AND curvy_score >= ${minScore}
          AND sample_count >= ${minSamples}
        ORDER BY curvy_score DESC
        LIMIT ${maxSegments}
      `,
    );
    rows = result.rows;
  } catch (err) {
    console.error("[route-weights] errore lettura segment_telemetry:", err);
    return {
      priority: [],
      applied: false,
      warning: "insufficient_data",
      coverage: {
        reason: "route_coverage_insufficient",
        coveredSegments: 0,
        requiredSegments: required,
        routeSegments,
        userKm,
        targetKm,
      },
    };
  }

  // Copertura del percorso: serve un minimo assoluto E una frazione dei segmenti.
  if (rows.length < required) {
    // Distingui "nessun dato community" da "dati presenti ma non su questa rotta":
    // se la rotta non copre nulla, verifica se esiste ALCUN curvy_score qualificato.
    let reason: TelemetryCoverageReason = "route_coverage_insufficient";
    if (rows.length === 0) {
      const hasCommunityData = await communityDataExists(minScore, minSamples);
      reason = hasCommunityData ? "route_coverage_insufficient" : "no_community_data";
    }
    return {
      priority: [],
      applied: false,
      warning: "insufficient_data",
      coverage: {
        reason,
        coveredSegments: rows.length,
        requiredSegments: required,
        routeSegments,
        userKm,
        targetKm,
      },
    };
  }

  const priority: PriorityRule[] = rows.map((r) => {
    const score = Math.min(100, Math.max(minScore, parseFloat(r.curvy_score)));
    // Boost lineare 1.2 (score=minScore) → 2.0 (score=100), scalato dallo stile.
    const base = 1.2 + ((score - minScore) / (100 - minScore)) * 0.8;
    const boost = Math.min(2.5, Math.round(base * styleScale * 100) / 100);
    return { if: `osm_way_id == ${r.osm_way_id}`, multiply_by: boost };
  });

  return {
    priority,
    applied: true,
    warning: null,
    coverage: {
      reason: "applied",
      coveredSegments: rows.length,
      requiredSegments: required,
      routeSegments,
      userKm,
      targetKm,
    },
  };
}

/** Coverage neutro per gli stati senza metriche (es. profilo geometrico). */
function emptyCoverage(reason: TelemetryCoverageReason): TelemetryCoverage {
  return {
    reason,
    coveredSegments: 0,
    requiredSegments: 0,
    routeSegments: 0,
    userKm: null,
    targetKm: null,
  };
}

/** True se esiste almeno un segmento con curvy_score qualificato nella community. */
async function communityDataExists(minScore: number, minSamples: number): Promise<boolean> {
  try {
    const r = await db.execute<{ one: number }>(
      sql`
        SELECT 1 AS one
        FROM segment_telemetry
        WHERE curvy_score IS NOT NULL
          AND curvy_score >= ${minScore}
          AND sample_count >= ${minSamples}
        LIMIT 1
      `,
    );
    return r.rows.length > 0;
  } catch (err) {
    console.error("[route-weights] errore verifica community data:", err);
    return false;
  }
}

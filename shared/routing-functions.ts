/**
 * Task #3193 — Registro delle "funzioni di routing" e degli engine supportati.
 *
 * Il sistema di routing esegue più operazioni distinte (calcolo percorso, map
 * matching, isocrone, matrice). Ogni operazione può essere servita da un engine
 * diverso. Questo registro è la fonte condivisa (client + server) di:
 *   - quali funzioni esistono e cosa fanno;
 *   - quali engine sono ammessi per ciascuna funzione;
 *   - quale engine è il default quando l'admin non ha scelto.
 *
 * La configurazione effettiva (scelta admin) è persistita su DB nella AppSetting
 * `routing_function_engines` (valueJson) — vedi server/routing/function-engine-config.ts.
 */
import type { RoutingEngineId } from "./maps-config";

export type RoutingFunctionId = "routing" | "auto_curvy" | "map_matching" | "isochrone" | "matrix";

export interface RoutingFunctionDef {
  id: RoutingFunctionId;
  label: string;
  description: string;
  /** Engine ammessi per questa funzione (ordine = preferenza tipica). */
  supportedEngines: RoutingEngineId[];
  /** Engine usato quando nessun override admin è presente. */
  defaultEngine: RoutingEngineId;
}

export const ROUTING_FUNCTIONS: RoutingFunctionDef[] = [
  {
    id: "routing",
    label: "Calcolo percorso",
    description: "Calcolo del percorso tra waypoint (route planning, percorsi curvy).",
    supportedEngines: ["ai", "graphhopper", "valhalla", "tomtom"],
    defaultEngine: "ai",
  },
  {
    id: "auto_curvy",
    label: "Percorso auto curvy",
    description: "Percorso panoramico per automobili (statali/provinciali, no autostrade) via Valhalla.",
    supportedEngines: ["valhalla"],
    defaultEngine: "valhalla",
  },
  {
    id: "map_matching",
    label: "Map matching",
    description: "Associa una traccia GPS alle strade OSM (telemetria, snap-to-road).",
    supportedEngines: ["graphhopper", "valhalla"],
    defaultEngine: "valhalla",
  },
  {
    id: "isochrone",
    label: "Isocrone",
    description: "Area raggiungibile in un dato tempo da un punto di partenza.",
    supportedEngines: ["valhalla"],
    defaultEngine: "valhalla",
  },
  {
    id: "matrix",
    label: "Matrice tempi/distanze",
    description: "Matrice di tempi e distanze tra N origini e M destinazioni.",
    supportedEngines: ["valhalla"],
    defaultEngine: "valhalla",
  },
];

export type RoutingFunctionEngineMap = Record<RoutingFunctionId, RoutingEngineId>;

/** Chiave AppSetting (valueJson) che persiste la config per-funzione. */
export const ROUTING_FUNCTION_ENGINES_KEY = "routing_function_engines";

// Task #164 — default versionati in codice: routing = Modalità AI,
// map_matching = Valhalla. Su DB vuoto la config effettiva è già questa,
// senza scritture manuali. Gli override admin (routing_function_engines)
// vincono sempre su questi default.
export const DEFAULT_FUNCTION_ENGINES: RoutingFunctionEngineMap = {
  routing: "ai",
  auto_curvy: "valhalla",
  map_matching: "valhalla",
  isochrone: "valhalla",
  matrix: "valhalla",
};

export function getFunctionDef(fn: RoutingFunctionId): RoutingFunctionDef | undefined {
  return ROUTING_FUNCTIONS.find((f) => f.id === fn);
}

export function isEngineSupportedForFunction(
  fn: RoutingFunctionId,
  engine: RoutingEngineId,
): boolean {
  const def = getFunctionDef(fn);
  return !!def && def.supportedEngines.includes(engine);
}

/**
 * Normalizza una config parziale/non affidabile in una mappa completa:
 * - parte dai default;
 * - applica solo i valori per funzioni note il cui engine è supportato;
 * - scarta silenziosamente chiavi sconosciute o engine non ammessi.
 */
export function normalizeFunctionEngines(raw: unknown): RoutingFunctionEngineMap {
  const out: RoutingFunctionEngineMap = { ...DEFAULT_FUNCTION_ENGINES };
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const def of ROUTING_FUNCTIONS) {
      const val = obj[def.id];
      if (typeof val === "string" && def.supportedEngines.includes(val as RoutingEngineId)) {
        out[def.id] = val as RoutingEngineId;
      }
    }
  }
  return out;
}

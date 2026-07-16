/**
 * Task #3193 — Configurazione per-funzione degli engine di routing.
 *
 * Legge/scrive su DB (AppSetting `routing_function_engines`, valueJson) quale
 * engine è preferito per ogni funzione di routing. È il punto di partenza per il
 * SmartRouterSelector (#3190) e l'AI selector (#3191).
 *
 * Principio anti-regressione: su DB persistiamo SOLO gli override espliciti
 * scelti dall'admin (mai i default materializzati). La funzione "routing"
 * (calcolo percorso), finché non ha un override esplicito, ricade sul vecchio
 * setting globale `maps_routing_engine` — così i deployment esistenti non
 * cambiano comportamento quando l'admin tocca un'altra funzione.
 */
import { storage } from "../storage";
import { dedupWarn } from "../lib/dedup-logger";
import type { RoutingEngineId } from "@shared/maps-config";
import {
  DEFAULT_FUNCTION_ENGINES,
  ROUTING_FUNCTION_ENGINES_KEY,
  ROUTING_FUNCTIONS,
  isEngineSupportedForFunction,
  type RoutingFunctionEngineMap,
  type RoutingFunctionId,
} from "@shared/routing-functions";

const LEGACY_ROUTING_ENGINE_KEY = "maps_routing_engine";

/**
 * Override espliciti salvati dall'admin (solo le chiavi realmente presenti su DB
 * e con engine valido). NON include i default.
 */
async function getStoredOverrides(): Promise<Partial<RoutingFunctionEngineMap>> {
  const setting = await storage.getAppSetting(ROUTING_FUNCTION_ENGINES_KEY);
  const raw = setting?.valueJson;
  const out: Partial<RoutingFunctionEngineMap> = {};
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const def of ROUTING_FUNCTIONS) {
      const v = obj[def.id];
      if (typeof v === "string" && def.supportedEngines.includes(v as RoutingEngineId)) {
        out[def.id] = v as RoutingEngineId;
      }
    }
  }
  return out;
}

/**
 * Config effettiva realmente in uso: override espliciti → (per "routing") vecchio
 * `maps_routing_engine` → default. È ciò che il runtime usa E ciò che la UI mostra,
 * così non c'è disallineamento tra pannello e comportamento reale.
 */
export async function getFunctionEngineConfig(): Promise<RoutingFunctionEngineMap> {
  const [overrides, legacy] = await Promise.all([
    getStoredOverrides(),
    storage.getAppSetting(LEGACY_ROUTING_ENGINE_KEY),
  ]);

  const out: RoutingFunctionEngineMap = { ...DEFAULT_FUNCTION_ENGINES, ...overrides };

  // "routing": senza override esplicito, ricadi sul legacy globale.
  if (overrides.routing === undefined) {
    const legacyVal = legacy?.value;
    if (legacyVal && isEngineSupportedForFunction("routing", legacyVal as RoutingEngineId)) {
      out.routing = legacyVal as RoutingEngineId;
      // Task #164 — visibilità nei log quando la config effettiva viene ancora
      // dal setting legacy globale invece che da routing_function_engines.
      dedupWarn(
        "routing-config",
        `legacy fallback maps_routing_engine attivo (="${legacyVal}") — impostare routing_function_engines nel DB`,
      );
    }
  }

  return out;
}

/**
 * Engine effettivo per una specifica funzione.
 */
export async function getEngineForFunction(fn: RoutingFunctionId): Promise<RoutingEngineId> {
  const config = await getFunctionEngineConfig();
  return config[fn];
}

/**
 * Engine per il calcolo percorso ("routing") — usato dal route planner.
 */
export async function resolveRoutingEngine(): Promise<RoutingEngineId> {
  const config = await getFunctionEngineConfig();
  return config.routing;
}

/**
 * Applica un aggiornamento (parziale) della config: valida ogni engine rispetto
 * alla funzione, poi persiste SOLO gli override espliciti (accumulati su quelli
 * già presenti). Lancia un Error sul primo valore non valido senza scrivere nulla.
 * Restituisce la config effettiva risultante.
 */
export async function setFunctionEngineConfig(
  partial: Partial<Record<RoutingFunctionId, unknown>>,
): Promise<RoutingFunctionEngineMap> {
  const overrides = await getStoredOverrides();
  const next: Partial<RoutingFunctionEngineMap> = { ...overrides };

  for (const def of ROUTING_FUNCTIONS) {
    const engine = partial[def.id];
    if (engine === undefined) continue;
    if (
      typeof engine !== "string" ||
      !def.supportedEngines.includes(engine as RoutingEngineId)
    ) {
      throw new Error(`Engine "${String(engine)}" non valido per la funzione "${def.id}".`);
    }
    next[def.id] = engine as RoutingEngineId;
  }

  await storage.upsertAppSetting(ROUTING_FUNCTION_ENGINES_KEY, undefined, next);
  return getFunctionEngineConfig();
}

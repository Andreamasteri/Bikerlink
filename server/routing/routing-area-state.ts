/**
 * Stato abilitato per-gruppo del Routing ad Aree — BikerLink (Task #3122)
 *
 * Tiene quali gruppi-area (vedi shared/routing-areas.ts) sono abilitati a
 * servire richieste. Lo stato è una mappa { codice → boolean } persistita in
 * `app_settings` (chiave `routing_areas_enabled`, colonna JSONB `value_json`),
 * inizializzata dai default `abilitatoDefault` del registro.
 *
 * Scelta deliberata: NESSUNA nuova tabella/PostGIS — il match per-coordinata usa
 * i bbox del registro condiviso, e lo stato sta in app_settings. Evita le
 * migrazioni che in passato hanno fatto fallire i deploy.
 *
 * Cache in-memory invalidata da `setAreaEnabled`/`refreshAreaEnabledMap`.
 */

import { storage } from "../storage";
import {
  ROUTING_AREAS,
  getRoutingArea,
  type RoutingAreaCode,
} from "@shared/routing-areas";

/** Chiave app_settings (lo stato vive in value_json, non in value). */
const DB_KEY = "routing_areas_enabled";

type AreaEnabledMap = Record<RoutingAreaCode, boolean>;

let cache: AreaEnabledMap | null = null;

/** Mappa di default dal registro (seed `abilitatoDefault`). */
function defaultsMap(): AreaEnabledMap {
  return ROUTING_AREAS.reduce((acc, a) => {
    acc[a.codice] = a.abilitatoDefault;
    return acc;
  }, {} as AreaEnabledMap);
}

async function readDbMap(): Promise<AreaEnabledMap> {
  const map = defaultsMap();
  try {
    const s = await storage.getAppSetting(DB_KEY);
    const json = s?.valueJson as Record<string, unknown> | null | undefined;
    if (json && typeof json === "object") {
      for (const code of Object.keys(map) as RoutingAreaCode[]) {
        if (typeof json[code] === "boolean") map[code] = json[code] as boolean;
      }
    }
  } catch (err) {
    console.error("[routing-area-state] lettura DB fallita:", err);
  }
  return map;
}

/** Mappa completa codice → abilitato (cache lazy alla prima chiamata). */
export async function getAreaEnabledMap(): Promise<AreaEnabledMap> {
  if (cache === null) cache = await readDbMap();
  return { ...cache };
}

/** true se il gruppo indicato è abilitato. */
export async function isAreaEnabled(code: RoutingAreaCode): Promise<boolean> {
  const map = await getAreaEnabledMap();
  return map[code] ?? false;
}

/** Imposta lo stato abilitato di un gruppo (DB JSONB + cache). */
export async function setAreaEnabled(
  code: RoutingAreaCode,
  enabled: boolean,
): Promise<AreaEnabledMap> {
  if (!getRoutingArea(code)) throw new Error(`Codice area sconosciuto: ${code}`);
  const next = await getAreaEnabledMap();
  next[code] = enabled;
  // value_json è il 3° argomento; value (2°) resta undefined apposta.
  await storage.upsertAppSetting(DB_KEY, undefined, next);
  cache = next;
  return { ...next };
}

/** Forza una rilettura della mappa dal DB. */
export async function refreshAreaEnabledMap(): Promise<AreaEnabledMap> {
  cache = await readDbMap();
  return { ...cache };
}

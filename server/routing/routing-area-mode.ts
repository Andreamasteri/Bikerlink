/**
 * Master Toggle Routing ad Aree — BikerLink (Task #3122)
 *
 * Controlla se il sistema di routing "ad aree regionali" (un'istanza GraphHopper
 * dedicata per gruppo-nazioni, vedi shared/routing-areas.ts) è attivo.
 *
 * Modalità (persistite in `app_settings`, chiave `routing_area_mode`):
 *   - "disabled" → comportamento STORICO: una sola istanza GraphHopper globale,
 *                  nessuna selezione per area. È il DEFAULT (impatto zero).
 *   - "tester"   → attivo solo per gli utenti map-tester (rollout graduale).
 *   - "enabled"  → attivo per tutti.
 *
 * Il valore DB è cache-ato in memoria per evitare una query ad ogni richiesta di
 * routing; `setRoutingAreaMode` aggiorna sia il DB sia la cache.
 */

import { storage } from "../storage";

/** Chiave app_settings del master toggle. */
const DB_KEY = "routing_area_mode";

export type RoutingAreaMode = "disabled" | "tester" | "enabled";

export const ROUTING_AREA_MODES: RoutingAreaMode[] = ["disabled", "tester", "enabled"];

/** Cache in-memory della modalità. null = non ancora letta dal DB. */
let modeCache: RoutingAreaMode | null = null;

function isValidMode(v: unknown): v is RoutingAreaMode {
  return typeof v === "string" && (ROUTING_AREA_MODES as string[]).includes(v);
}

async function readDbMode(): Promise<RoutingAreaMode> {
  try {
    const s = await storage.getAppSetting(DB_KEY);
    return isValidMode(s?.value) ? s!.value as RoutingAreaMode : "disabled";
  } catch (err) {
    console.error("[routing-area-mode] lettura DB fallita:", err);
    return "disabled";
  }
}

/** Modalità corrente (cache lazy alla prima chiamata). */
export async function getRoutingAreaMode(): Promise<RoutingAreaMode> {
  if (modeCache === null) modeCache = await readDbMode();
  return modeCache;
}

/**
 * true se il routing ad aree è attivo per questa richiesta.
 * In modalità "tester" dipende dal flag map-tester dell'utente.
 */
export async function isAreaRoutingActive(isMapTester: boolean): Promise<boolean> {
  const mode = await getRoutingAreaMode();
  if (mode === "enabled") return true;
  if (mode === "tester") return isMapTester;
  return false;
}

/** Imposta la modalità (DB + cache). */
export async function setRoutingAreaMode(mode: RoutingAreaMode): Promise<void> {
  if (!isValidMode(mode)) throw new Error(`Modalità routing-area non valida: ${String(mode)}`);
  await storage.upsertAppSetting(DB_KEY, mode);
  modeCache = mode;
}

/** Forza una rilettura della modalità dal DB (es: dopo modifiche esterne). */
export async function refreshRoutingAreaMode(): Promise<RoutingAreaMode> {
  modeCache = await readDbMode();
  return modeCache;
}

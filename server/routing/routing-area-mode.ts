/**
 * Master Toggle Routing ad Aree — BikerLink (Task #3122)
 *
 * Controlla se il sistema di routing "ad aree regionali" (un'istanza GraphHopper
 * dedicata per gruppo-nazioni, vedi shared/routing-areas.ts) è attivo.
 *
 * Modalità (persistite in `app_settings`, chiave `routing_area_mode`):
 *   - "disabled" → comportamento STORICO: una sola istanza GraphHopper globale,
 *                  nessuna selezione per area. Il ThinkCentre è però migrato in
 *                  pianta stabile al multi-area (root `/info`/`/route` risponde
 *                  404 in modo permanente): questa modalità NON funziona più.
 *   - "tester"   → attivo solo per gli utenti map-tester (rollout graduale).
 *   - "enabled"  → attivo per tutti. È il DEFAULT: se la chiave non è ancora
 *                  stata scritta in `app_settings` (es. su un DB appena
 *                  ripristinato/prod non ancora migrato), o se la lettura DB
 *                  fallisce, ricadere su "disabled" instraderebbe silenziosamente
 *                  verso l'istanza legacy morta → outage di routing (Task #52).
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
    // Task #52: chiave assente (default) → "enabled", non "disabled" — la
    // modalità legacy è morta in modo permanente sul ThinkCentre.
    return isValidMode(s?.value) ? s!.value as RoutingAreaMode : "enabled";
  } catch (err) {
    console.error("[routing-area-mode] lettura DB fallita:", err);
    // Fail-safe verso il percorso VIVO (multi-area), non verso quello morto.
    return "enabled";
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

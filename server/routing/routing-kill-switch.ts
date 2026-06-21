/**
 * Soft Kill-Switch Routing — BikerLink (Task #2824)
 *
 * Gestisce l'abilitazione/disabilitazione del routing tramite un soft toggle
 * persistito nel DB (`app_settings`), modificabile dall'admin senza toccare
 * i Secrets. Il valore DB è cache-ato in memoria; `setRoutingEnabled` aggiorna
 * sia il DB sia la cache in-memory.
 *
 * ⚠️  ROUTING_DISABLED (env var) — DEPRECATA, NON IMPOSTARE IN PRODUZIONE
 *
 *   La logica env var è mantenuta per retrocompatibilità di emergenza estrema,
 *   ma la variabile NON va mai impostata nei Secrets di Replit:
 *   - Se baked nel container bypassa il soft toggle admin rendendolo inoperante.
 *   - Non può essere rimossa via OTA (vive nel server, non nel bundle JS).
 *   - scripts/deploy-build.sh blocca il deploy se la variabile è presente.
 *   - scripts/validate-credentials.ts la segnala come errore critico.
 *
 *   Per abilitare/disabilitare il routing usa SEMPRE:
 *     Admin → Hub Routing → kill-switch (soft toggle DB)
 *
 * Logica env residua (precedenza dall'alto, solo se var è presente):
 *   1. env `ROUTING_DISABLED="0"`     → routing FORZATO ON  (prevale sul DB)
 *   2. env `ROUTING_DISABLED` = altro → routing FORZATO OFF (prevale sul DB)
 *   3. env non settata (corretto)     → soft toggle DB `routing_kill_switch`
 */

import { storage } from "../storage";

/** Chiave app_settings. Valore "true" = routing abilitato; assente/"false" = disabilitato. */
const DB_KEY = "routing_kill_switch";

const ENV_RAW = process.env.ROUTING_DISABLED;
/** env="0" → routing forzato ON (prevale sempre sul DB). */
const HARD_ON = ENV_RAW === "0";
/** env settata a un valore non vuoto diverso da "0" → routing forzato OFF. */
export const HARD_OFF = ENV_RAW !== undefined && ENV_RAW !== "" && ENV_RAW !== "0";

/**
 * true quando un hard override env è attivo (in entrambe le direzioni).
 * Nota: HARD_ON NON blocca il soft toggle — l'utente può pre-impostare il
 * valore DB anche quando l'env forza ON (il toggle avrà effetto quando l'env
 * verrà rimossa). Solo HARD_OFF blocca effettivamente il toggle.
 */
export const HAS_HARD_ENV_OVERRIDE = HARD_ON || HARD_OFF;

/** Cache in-memory del soft toggle DB. null = non ancora letto. */
let softCache: boolean | null = null;

async function readDbSoft(): Promise<boolean> {
  try {
    const s = await storage.getAppSetting(DB_KEY);
    return s?.value === "true";
  } catch (err) {
    console.error("[routing-kill-switch] lettura DB fallita:", err);
    return false;
  }
}

/**
 * true se il routing è abilitato adesso. Risolve l'hard override env e, in
 * soft mode, la cache DB (popolata lazy alla prima chiamata).
 */
export async function isRoutingEnabled(): Promise<boolean> {
  if (HARD_ON) return true;
  if (HARD_OFF) return false;
  if (softCache === null) softCache = await readDbSoft();
  return softCache;
}

/**
 * Variante sincrona per i percorsi che non possono attendere il DB. Usa la
 * cache già popolata; se mai letta in soft mode, assume disabilitato.
 */
export function isRoutingEnabledSync(): boolean {
  if (HARD_ON) return true;
  if (HARD_OFF) return false;
  return softCache ?? false;
}

/**
 * Imposta il soft toggle (DB + cache). In presenza di hard override env il
 * valore DB viene comunque persistito ma non ha effetto finché l'override
 * resta attivo.
 */
export async function setRoutingEnabled(enabled: boolean): Promise<void> {
  await storage.upsertAppSetting(DB_KEY, enabled ? "true" : "false");
  softCache = enabled;
}

/** Forza una rilettura del soft toggle dal DB (es: dopo modifiche esterne). */
export async function refreshRoutingKillSwitch(): Promise<boolean> {
  softCache = await readDbSoft();
  return softCache;
}

export interface RoutingKillSwitchState {
  /** Stato effettivo del routing (env override risolto + soft toggle). */
  enabled: boolean;
  /** "forced-on" | "forced-off" quando un env override è attivo, altrimenti null. */
  envOverride: "forced-on" | "forced-off" | null;
  /** Soft toggle DB attualmente in cache (null se mai letto). */
  softEnabled: boolean | null;
}

/** Snapshot dello stato kill-switch per il pannello admin. */
export async function getRoutingKillSwitchState(): Promise<RoutingKillSwitchState> {
  const enabled = await isRoutingEnabled();
  const soft = HAS_HARD_ENV_OVERRIDE ? softCache : (softCache ?? (await refreshRoutingKillSwitch()));
  return {
    enabled,
    envOverride: HARD_ON ? "forced-on" : HARD_OFF ? "forced-off" : null,
    softEnabled: soft,
  };
}

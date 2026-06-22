/**
 * Soft Kill-Switch Routing — BikerLink (Task #2824)
 *
 * Gestisce l'abilitazione/disabilitazione del routing tramite un soft toggle
 * persistito nel DB (`app_settings`), modificabile dall'admin senza toccare
 * i Secrets. Il valore DB è cache-ato in memoria; `setRoutingEnabled` aggiorna
 * sia il DB sia la cache in-memory.
 *
 * Per abilitare/disabilitare il routing usa SEMPRE:
 *   Admin → Hub Routing → kill-switch (soft toggle DB)
 */

import { storage } from "../storage";

/** Chiave app_settings. Valore "true" = routing abilitato; assente/"false" = disabilitato. */
const DB_KEY = "routing_kill_switch";

/** Rimosso: HARD_OFF / HAS_HARD_ENV_OVERRIDE — logica ROUTING_DISABLED env eliminata. */
export const HARD_OFF = false;
export const HAS_HARD_ENV_OVERRIDE = false;

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
 * true se il routing è abilitato adesso.
 * Comanda esclusivamente il toggle DB (cache lazy alla prima chiamata).
 */
export async function isRoutingEnabled(): Promise<boolean> {
  if (softCache === null) softCache = await readDbSoft();
  return softCache;
}

/**
 * Variante sincrona per i percorsi che non possono attendere il DB.
 * Usa la cache già popolata; se mai letta, assume disabilitato.
 */
export function isRoutingEnabledSync(): boolean {
  return softCache ?? false;
}

/** Imposta il soft toggle (DB + cache). */
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
  /** Stato effettivo del routing (soft toggle DB). */
  enabled: boolean;
  /** Sempre null — logica env override rimossa. */
  envOverride: null;
  /** Soft toggle DB attualmente in cache (null se mai letto). */
  softEnabled: boolean | null;
}

/** Snapshot dello stato kill-switch per il pannello admin. */
export async function getRoutingKillSwitchState(): Promise<RoutingKillSwitchState> {
  const enabled = await isRoutingEnabled();
  const soft = softCache ?? (await refreshRoutingKillSwitch());
  return {
    enabled,
    envOverride: null,
    softEnabled: soft,
  };
}

// Task #2686 — Kill-switch dedicati per il modulo Maps Watchdog.
// Quattro flag indipendenti (default true): telemetria client, collector,
// diagnosi LLM, push alert. Usano la stessa tabella `app_settings`.
import { storage } from "../../storage";

const KEYS = {
  telemetry: "ai_watchdog_maps_telemetry_enabled",
  collector: "ai_watchdog_maps_collector_enabled",
  llm: "ai_watchdog_maps_llm_enabled",
  alerts: "ai_watchdog_maps_alerts_enabled",
} as const;

export type MapsKillSwitchKey = keyof typeof KEYS;

interface CachedFlag { value: boolean; at: number }
const TTL_MS = 5_000;
const cache = new Map<MapsKillSwitchKey, CachedFlag>();

const _loggedOnce = new Set<MapsKillSwitchKey>();

export async function isMapsFlagEnabled(flag: MapsKillSwitchKey): Promise<boolean> {
  const now = Date.now();
  const c = cache.get(flag);
  if (c && now - c.at < TTL_MS) return c.value;
  try {
    const row = await storage.getAppSetting(KEYS[flag]);
    const v = (row?.value ?? "true").toLowerCase();
    const value = v !== "false" && v !== "0";
    cache.set(flag, { value, at: now });
    if (!_loggedOnce.has(flag)) {
      _loggedOnce.add(flag);
      console.log(`[maps-kill-switch] ${flag} = ${value} (db=${row?.value ?? "not set, default true"})`);
    }
    return value;
  } catch {
    cache.set(flag, { value: true, at: now });
    return true;
  }
}

export async function setMapsFlag(flag: MapsKillSwitchKey, enabled: boolean): Promise<void> {
  try {
    await storage.upsertAppSetting(KEYS[flag], enabled ? "true" : "false");
  } catch (err) {
    console.warn("[maps-watchdog/kill-switch] upsert error:", err);
  }
  cache.set(flag, { value: enabled, at: Date.now() });
}

export async function getAllMapsFlags(): Promise<Record<MapsKillSwitchKey, boolean>> {
  const entries = await Promise.all(
    (Object.keys(KEYS) as MapsKillSwitchKey[]).map(async (k) => [k, await isMapsFlagEnabled(k)] as const),
  );
  return Object.fromEntries(entries) as Record<MapsKillSwitchKey, boolean>;
}

export function invalidateMapsFlagsCache(): void { cache.clear(); }

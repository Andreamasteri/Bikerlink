// Task #2533 — Kill switch del watchdog. Setting `ai_watchdog_enabled` (default true).
// Quando disabilitato: nessun ciclo aggregator, niente auto-fix, niente proposal, niente alert,
// niente chat AI, niente report settimanale. Endpoint admin per leggere/toggle.
import { storage } from "../../storage";
import { emitWatchdogKillSwitch } from "../coordinator/integrations/watchdog";

const SETTING_KEY = "ai_watchdog_enabled";
let cachedAt = 0;
let cached = true;
const TTL_MS = 5_000;

export async function isWatchdogEnabled(): Promise<boolean> {
  const now = Date.now();
  if (now - cachedAt < TTL_MS) return cached;
  try {
    const row = await storage.getAppSetting(SETTING_KEY);
    const v = (row?.value ?? "true").toLowerCase();
    cached = v !== "false" && v !== "0";
  } catch {
    cached = true;
  }
  cachedAt = now;
  return cached;
}

export async function setWatchdogEnabled(enabled: boolean, triggeredBy?: string, reason?: string): Promise<void> {
  try {
    await storage.upsertAppSetting(SETTING_KEY, enabled ? "true" : "false");
  } catch (err) {
    console.warn("[watchdog/kill-switch] upsert error:", err);
  }
  cached = enabled;
  cachedAt = Date.now();
  // Task #2654 — Notifica Coordinator (graceful)
  await emitWatchdogKillSwitch({ enabled, triggeredBy, reason });
}

export function invalidateCache(): void {
  cachedAt = 0;
}

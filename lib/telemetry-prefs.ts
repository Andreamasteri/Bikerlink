import AsyncStorage from "@react-native-async-storage/async-storage";

// Task #3115 — Toggle "Telemetria sempre attiva".
// Override globale: quando ON (default), la raccolta telemetria ignora qualsiasi
// flag di disabilitazione proveniente da altri moduli (es. kill-switch maps lato
// server). Persistito in AsyncStorage; una cache in-memory permette letture sync
// dai punti caldi (emitMapsTelemetry) senza await.

export const TELEMETRY_ALWAYS_ACTIVE_KEY = "telemetry_always_active";

// Default ON: la app raccoglie sempre, salvo l'utente non disattivi esplicitamente.
let cached = true;
let hydrated = false;

/** Lettura sincrona della cache in-memory (default true finché non idratata). */
export function getTelemetryAlwaysActive(): boolean {
  return cached;
}

/** Idrata la cache da AsyncStorage. Idempotente. */
export async function loadTelemetryAlwaysActive(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(TELEMETRY_ALWAYS_ACTIVE_KEY);
    if (raw === "0" || raw === "false") cached = false;
    else cached = true;
  } catch {
    // best-effort: mantieni il default
  }
  hydrated = true;
  return cached;
}

/** Imposta e persiste il valore, aggiornando la cache in-memory. */
export async function setTelemetryAlwaysActive(value: boolean): Promise<void> {
  cached = value;
  hydrated = true;
  try {
    await AsyncStorage.setItem(TELEMETRY_ALWAYS_ACTIVE_KEY, value ? "1" : "0");
  } catch {
    // best-effort
  }
}

export function isTelemetryPrefHydrated(): boolean {
  return hydrated;
}

// Idratazione eager all'import del modulo: garantisce che la cache rifletta il
// valore persistito il prima possibile, prima che emitMapsTelemetry venga
// chiamato dai primi eventi mappa (evita la corsa al cold start).
void loadTelemetryAlwaysActive();

// Task #110 — Master switch globale "Fallback AI".
//
// Un unico toggle admin che decide se l'app può ricadere dai modelli self-hosted
// ThinkCentre (Ollama: Bowie/Horus/Quebracho) sui provider cloud a pagamento
// (Groq/Gemini/OpenAI).
//
//   ON  = comportamento multi-provider odierno (Ollama-first, poi chain cloud).
//   OFF = SOLO il modello self-hosted ThinkCentre viene mai usato; se non è
//         disponibile la feature degrada con un errore chiaro, senza MAI tentare
//         un provider cloud.
//
// Default OFF (false) quando la setting non è impostata (fresh install).
//
// Pattern identico a watchdog/kill-switch.ts e readPreferredProvider: setting
// persistita in AppSetting + cache in-memory con TTL, invalidata alla scrittura.
// DB key: `ai_fallback_enabled` — "true" / "false".
import { storage } from "../storage";

const SETTING_KEY = "ai_fallback_enabled";
const TTL_MS = 5_000;

// Default OFF: finché non abbiamo letto il DB (o se la lettura fallisce) la cache
// vale false, cioè "solo ThinkCentre". È la direzione SICURA: nel dubbio non si
// raggiunge mai un provider cloud a pagamento.
let cached = false;
let cachedAt = 0;
let everLoaded = false;

/**
 * Ritorna true se il fallback cloud è abilitato. Async, con cache TTL 5s.
 * Fail-safe: qualsiasi errore di lettura ⇒ false (solo ThinkCentre).
 */
export async function isAiFallbackEnabled(): Promise<boolean> {
  const now = Date.now();
  if (everLoaded && now - cachedAt < TTL_MS) return cached;
  try {
    const row = await storage.getAppSetting(SETTING_KEY);
    const v = (row?.value ?? "false").toLowerCase();
    cached = v === "true" || v === "1";
  } catch {
    cached = false; // fail-safe: default OFF (solo ThinkCentre)
  }
  cachedAt = now;
  everLoaded = true;
  return cached;
}

/**
 * Versione SINCRONA per i costruttori sincroni (es. resolveModel). Ritorna
 * l'ultimo valore noto della cache (default OFF finché non caricata). Se la cache
 * non è mai stata caricata, avvia un refresh in background così le chiamate
 * successive saranno accurate. Nel frattempo restituisce la direzione sicura (OFF).
 */
export function isAiFallbackEnabledSync(): boolean {
  if (!everLoaded) void isAiFallbackEnabled();
  return cached;
}

/**
 * Persiste il toggle e aggiorna la cache. Fail-fast: se la scrittura DB fallisce
 * l'errore si propaga e la cache NON viene aggiornata, così il chiamante (endpoint
 * admin) può rispondere con un 5xx onesto invece di far credere che il master switch
 * globale sia cambiato mentre lo stato persistito è rimasto quello vecchio.
 */
export async function setAiFallbackEnabled(enabled: boolean): Promise<void> {
  await storage.upsertAppSetting(SETTING_KEY, enabled ? "true" : "false");
  // Solo dopo una persistenza riuscita aggiorna la cache in-memory.
  cached = enabled;
  cachedAt = Date.now();
  everLoaded = true;
}

/** Invalida la cache (forza rilettura al prossimo isAiFallbackEnabled). Per i test. */
export function invalidateAiFallbackCache(): void {
  cachedAt = 0;
  everLoaded = false;
  cached = false;
}

import AsyncStorage from "@react-native-async-storage/async-storage";

const LAST_KNOWN_VERSION_KEY = "bikerlink:last_known_version";

/**
 * Persiste la versione corrente dell'app in AsyncStorage.
 * Chiamare dopo aver completato il re-fetch post-aggiornamento.
 */
export async function saveLastKnownVersion(version: string): Promise<void> {
  await AsyncStorage.setItem(LAST_KNOWN_VERSION_KEY, version);
}

/**
 * Legge la versione dell'app dall'ultima esecuzione.
 * Restituisce null se non è mai stata salvata (installazione fresca o primo avvio post-aggiornamento).
 */
export async function loadLastKnownVersion(): Promise<string | null> {
  const raw = await AsyncStorage.getItem(LAST_KNOWN_VERSION_KEY);
  return raw ?? null;
}

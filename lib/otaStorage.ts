import AsyncStorage from "@react-native-async-storage/async-storage";

const APPLIED_OTA_KEY = "bikerlink:applied_ota_number";

/**
 * Persiste il numero dell'OTA applicato su questo dispositivo.
 * Chiamare questa funzione ogni volta che viene applicato un OTA (es. in publish-ota.sh o nell'update listener).
 */
export async function saveAppliedOtaNumber(otaNumber: number): Promise<void> {
  await AsyncStorage.setItem(APPLIED_OTA_KEY, String(otaNumber));
}

/**
 * Legge il numero dell'OTA applicato da AsyncStorage.
 * Restituisce null se non è stato salvato nessun OTA.
 */
export async function loadAppliedOtaNumber(): Promise<number | null> {
  const raw = await AsyncStorage.getItem(APPLIED_OTA_KEY);
  if (raw === null) return null;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? null : parsed;
}

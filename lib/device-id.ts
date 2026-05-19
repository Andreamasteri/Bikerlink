// Task #1357 — Sistema OTA modulare: device ID stabile per identificare
// ogni installazione lato server (assegnazione slot OTA, heartbeat, telemetria).
//
// Requisiti:
//  - persistente cross-restart e cross-OTA (sopravvive a reloadAsync e a
//    nuovi bundle, fintanto che l'utente non disinstalla l'APK)
//  - opaco: nessun PII (no IMEI, no email, no nickname)
//  - lunghezza sufficiente per evitare collisioni: usiamo UUID v4 (36 char)
//    seedato dove possibile dall'Android ID, altrimenti random
//
// Storage: AsyncStorage. Non usiamo expo-secure-store perché non è
// installato e il valore non è un segreto (è un identificatore opaco).

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import { Platform } from "react-native";

const DEVICE_ID_KEY = "bikerlink:ota:device-id:v1";

let _cachedId: string | null = null;
let _inFlight: Promise<string> | null = null;

function generateRandomId(): string {
  // UUID v4-like (sufficiente per chiave opaca, non usato per crypto).
  // Evitiamo expo-crypto / 'uuid' per non aggiungere dipendenze e perché
  // crypto.getRandomValues crasha su alcuni Android in Expo Go.
  const rnd = (n: number) =>
    Array.from({ length: n }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");
  return `${rnd(8)}-${rnd(4)}-4${rnd(3)}-${rnd(4)}-${rnd(12)}`;
}

function seedFromAndroidId(): string | null {
  if (Platform.OS !== "android") return null;
  try {
    const androidId = (Application as { getAndroidId?: () => string | null })
      .getAndroidId?.();
    if (!androidId || typeof androidId !== "string") return null;
    // Hash leggero per non esporre direttamente l'Android ID (è considerato
    // identifier persistente — Google lo classifica come "personal data").
    // Trasformiamo in UUID-shape opaco usando un hash deterministico semplice.
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < androidId.length; i++) {
      const ch = androidId.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    const a = (h1 >>> 0).toString(16).padStart(8, "0");
    const b = (h2 >>> 0).toString(16).padStart(8, "0");
    const c = ((h1 ^ h2) >>> 0).toString(16).padStart(8, "0");
    // Forma UUID-like (non un vero UUID v5, ma 36 char con trattini).
    return `${a}-${b.slice(0, 4)}-4${b.slice(4, 7)}-${c.slice(0, 4)}-${c}${a.slice(0, 4)}`;
  } catch {
    return null;
  }
}

/**
 * Ritorna un device ID stabile, persistente cross-restart e cross-OTA.
 * Prima chiamata: genera e salva. Chiamate successive: legge da cache.
 * Mai null: in caso di errore storage, ritorna un ID effimero per la sessione.
 */
export async function getStableDeviceId(): Promise<string> {
  if (_cachedId) return _cachedId;
  if (_inFlight) return _inFlight;

  _inFlight = (async () => {
    try {
      const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
      if (existing && typeof existing === "string" && existing.length >= 16) {
        _cachedId = existing;
        return existing;
      }
      const fresh = seedFromAndroidId() ?? generateRandomId();
      await AsyncStorage.setItem(DEVICE_ID_KEY, fresh);
      _cachedId = fresh;
      return fresh;
    } catch {
      // Storage non disponibile: fallback effimero, valido solo per la sessione.
      const ephemeral = generateRandomId();
      _cachedId = ephemeral;
      return ephemeral;
    } finally {
      _inFlight = null;
    }
  })();

  return _inFlight;
}

/**
 * Versione sincrona che ritorna l'ID cached, o null se non ancora caricato.
 * Utile per chiamate dove non si vuole await (es. dentro listener nativi).
 */
export function getCachedDeviceId(): string | null {
  return _cachedId;
}

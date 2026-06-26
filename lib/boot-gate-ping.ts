// Task #4979 — Livello B (passivo) del BootGate.
//
// Helper provider-free: invia un ping HTTP a /api/debug/boot-gate/ping per ogni
// checkpoint del boot, INDIPENDENTEMENTE dalla UI. Così, anche se l'app crasha
// prima di renderizzare React o prima che l'utente tocchi un bottone, il server
// sa esattamente a quale checkpoint si è fermata.
//
// Niente import di provider/context: questo modulo può essere chiamato a
// module-load, dentro gli error handler globali, e da componenti provider-free.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { getApiUrl } from "@/lib/query-client";

export type BootPingStatus =
  | "reached" // lo step è diventato corrente (in attesa di conferma utente)
  | "mounting" // sta per essere eseguito/montato (pre-side-effect)
  | "passed" // confermato con Sì ed eseguito senza crash
  | "skipped" // saltato con Skip
  | "stopped"; // l'utente ha premuto No: bug trovato qui

const DEVICE_ID_KEY = "bikerlink:ota:device-id:v1";
// Override MANUALE locale: lo setta esplicitamente l'utente/dev su questo device
// (es. dalla schermata admin). NON viene MAI toccato dal flag remoto: resta attivo
// finché non lo si rimuove a mano.
const BOOT_GATE_FLAG_KEY = "__BOOT_GATE__";
// Specchio dell'ULTIMO valore remoto noto del manifest. Serve solo da fallback
// offline quando il fetch del manifest fallisce. È SIMMETRICO: riflette sia
// l'accensione sia lo spegnimento remoto, così lo "Disattiva" admin si propaga
// ai prossimi avvii anche senza rete (a differenza dell'override manuale).
const BOOT_GATE_REMOTE_MIRROR_KEY = "__BOOT_GATE_REMOTE__";

let cachedDeviceId: string | null = null;

/**
 * Riusa lo stesso device-id usato dalla telemetria OTA quando disponibile, così
 * i ping del BootGate sono correlabili con gli eventi OTA dello stesso device.
 */
export async function getBootGateDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (existing) {
      cachedDeviceId = existing;
      return existing;
    }
    // Note: non usare il pacchetto uuid (crash iOS/Android).
    const fresh = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, fresh);
    cachedDeviceId = fresh;
    return fresh;
  } catch {
    const mem = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    cachedDeviceId = mem;
    return mem;
  }
}

/**
 * Invia un ping best-effort. Non lancia mai e non blocca: un fallimento di rete
 * non deve mai interferire con il boot.
 */
export async function pingBootGate(
  step: string,
  status: BootPingStatus,
  extra?: { appVersion?: string | null; note?: string },
): Promise<void> {
  try {
    const deviceId = await getBootGateDeviceId();
    await fetch(new URL("/api/debug/boot-gate/ping", getApiUrl()).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        deviceId,
        step,
        status,
        ts: Date.now(),
        platform: Platform.OS,
        appVersion: extra?.appVersion ?? null,
        note: extra?.note ?? null,
      }),
    });
  } catch {
    // no-op: il ping è puramente diagnostico.
  }
}

/** True se il BootGate è stato attivato su QUESTO dispositivo (flag locale). */
export async function isBootGateEnabledLocally(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(BOOT_GATE_FLAG_KEY)) === "1";
  } catch {
    return false;
  }
}

/** Attiva/disattiva il BootGate su questo dispositivo (effetto al prossimo avvio). */
export async function setBootGateEnabledLocally(enabled: boolean): Promise<void> {
  try {
    if (enabled) await AsyncStorage.setItem(BOOT_GATE_FLAG_KEY, "1");
    else await AsyncStorage.removeItem(BOOT_GATE_FLAG_KEY);
  } catch {
    // no-op
  }
}

/**
 * Ultimo valore remoto noto (fallback offline). Ritorna null se mai registrato,
 * così il chiamante distingue "remoto disattivato" da "remoto mai visto".
 */
export async function getBootGateRemoteMirror(): Promise<boolean | null> {
  try {
    const v = await AsyncStorage.getItem(BOOT_GATE_REMOTE_MIRROR_KEY);
    if (v === null) return null;
    return v === "1";
  } catch {
    return null;
  }
}

/**
 * Persiste in modo SIMMETRICO l'ultimo valore remoto: true→"1", false→"0".
 * Riflette anche lo spegnimento remoto, così lo "Disattiva" admin si propaga
 * agli avvii offline successivi (a differenza dell'override manuale, che resta).
 */
export async function setBootGateRemoteMirror(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(BOOT_GATE_REMOTE_MIRROR_KEY, enabled ? "1" : "0");
  } catch {
    // no-op
  }
}

export const BOOT_GATE_FLAG_STORAGE_KEY = BOOT_GATE_FLAG_KEY;
export const BOOT_GATE_REMOTE_MIRROR_STORAGE_KEY = BOOT_GATE_REMOTE_MIRROR_KEY;

import { useEffect, useRef } from "react";
import * as Updates from "expo-updates";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";

const DEVICE_ID_KEY = "@bikerlink/ota_device_id";
const PENDING_RELEASE_KEY = "@bikerlink/ota_pending_release_id";
const BOOT_SUCCESS_DELAY_MS = 8000;

async function getOrCreateDeviceId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    // Note: non usare il pacchetto uuid (crash iOS/Android) — Date.now() + random è sufficiente per device-id.
    const fresh = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}-${Math.random().toString(36).slice(2, 11)}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, fresh);
    return fresh;
  } catch {
    return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

async function postOtaEvent(payload: {
  releaseId?: string | null;
  easUpdateId?: string | null;
  deviceId: string;
  eventType: "downloaded" | "boot_success" | "boot_failure";
}): Promise<void> {
  try {
    await fetch(new URL("/api/ota/event", getApiUrl()).toString(), {
      method: "POST",
      // Auth via Bearer (cookie persistence può fallire al cold start in produzione)
      headers: authFetchHeaders({ "Content-Type": "application/json" }),
      credentials: "include",
      body: JSON.stringify({
        ...payload,
        platform: Platform.OS,
        appVersion: Updates.runtimeVersion ?? null,
      }),
    });
  } catch (err) {
    console.warn("[useOtaAutoUpdate] postOtaEvent failed:", err);
  }
}

interface ManifestResponse {
  allowed: boolean;
  isAdmin?: boolean;
  releaseId?: string;
  allowedEasUpdateId?: string;
  allowedEasGroupId?: string | null;
  runtimeVersion?: string | null;
  otaVersion?: string | null;
  status?: string;
}

async function fetchManifest(): Promise<ManifestResponse | null> {
  try {
    const res = await fetch(new URL("/api/ota/manifest", getApiUrl()).toString(), {
      method: "GET",
      // Auth via Bearer + cookie: senza Bearer un admin con cookie scaduto viene
      // trattato come utente normale e NON riceve la pending da testare.
      headers: authFetchHeaders(),
      credentials: "include",
    });
    if (!res.ok) return null;
    return (await res.json()) as ManifestResponse;
  } catch (err) {
    console.warn("[useOtaAutoUpdate] manifest fetch failed:", err);
    return null;
  }
}

/**
 * Auto-update OTA al primo avvio dell'app (Task #2503).
 *
 * Flusso gating server-side:
 *   1. Chiama GET /api/ota/manifest per sapere quale release è "autorizzata"
 *      per questo utente (admin → pending+approved; utente normale → solo approved).
 *   2. Solo se l'updateId riportato da expo-updates combacia con `allowedEasUpdateId`,
 *      scarichiamo + emettiamo evento `downloaded` + reload.
 *   3. Dopo 8s di app stabile sul nuovo bundle, emettiamo `boot_success`.
 *      Se il bundle crasha prima → niente boot_success (worker auto-rollback userà i contatori).
 */
export function useOtaAutoUpdate(): { checking: boolean } {
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      // Step A: telemetria boot_success per il bundle attualmente in esecuzione.
      // Se al boot precedente abbiamo applicato una OTA, segnalo che ha bootato senza crash dopo 8s.
      if (Platform.OS !== "web" && Updates.isEnabled && !__DEV__) {
        try {
          const deviceId = await getOrCreateDeviceId();
          const pendingId = await AsyncStorage.getItem(PENDING_RELEASE_KEY);
          const currentUpdateId = Updates.updateId ?? null;
          if (currentUpdateId) {
            setTimeout(() => {
              postOtaEvent({
                releaseId: pendingId,
                easUpdateId: currentUpdateId,
                deviceId,
                eventType: "boot_success",
              }).finally(() => {
                AsyncStorage.removeItem(PENDING_RELEASE_KEY).catch(() => undefined);
              });
            }, BOOT_SUCCESS_DELAY_MS);
          }
        } catch (err) {
          console.warn("[useOtaAutoUpdate] boot_success telemetry skipped:", err);
        }
      }

      // Step B: nuovo cold-start check con gating server-side
      if (Platform.OS === "web") return;
      if (!Updates.isEnabled) return;
      if (__DEV__) return;

      try {
        const manifest = await fetchManifest();
        if (!manifest || !manifest.allowed || !manifest.allowedEasUpdateId) {
          // Nessuna OTA distribuibile a questo utente → non parliamo nemmeno con EAS.
          return;
        }

        // Se siamo già su questo bundle, non fare nulla.
        if (Updates.updateId && Updates.updateId === manifest.allowedEasUpdateId) {
          return;
        }

        const check = await Updates.checkForUpdateAsync();
        if (!check.isAvailable) return;

        // Gating: solo se EAS sta servendo proprio l'updateId che il nostro server autorizza.
        // (Su build 53, expo-updates non sa di questo gating: validiamo lato client.)
        const incomingId = (check.manifest as { id?: string } | undefined)?.id;
        if (incomingId && manifest.allowedEasUpdateId && incomingId !== manifest.allowedEasUpdateId) {
          console.log(
            `[useOtaAutoUpdate] update disponibile (${incomingId}) ≠ autorizzato (${manifest.allowedEasUpdateId}) — skip`,
          );
          return;
        }

        const deviceId = await getOrCreateDeviceId();

        const result = await Updates.fetchUpdateAsync();
        if (!result.isNew) return;

        await postOtaEvent({
          releaseId: manifest.releaseId ?? null,
          easUpdateId: manifest.allowedEasUpdateId,
          deviceId,
          eventType: "downloaded",
        });

        // Memorizza la release in attesa così possiamo emettere boot_success al prossimo boot
        try {
          if (manifest.releaseId) {
            await AsyncStorage.setItem(PENDING_RELEASE_KEY, manifest.releaseId);
          }
        } catch { /* ignore */ }

        await Updates.reloadAsync();
      } catch (err) {
        console.warn("[useOtaAutoUpdate] OTA check/fetch failed:", err);
      }
    })();
  }, []);

  return { checking: false };
}

import { useState, useEffect } from "react";
import { InteractionManager } from "react-native";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import * as SplashScreen from "expo-splash-screen";
import { sendStartupBeacon, recoverLastBeacon } from "@/lib/startup-beacon";
import { purgeLegacyGpsBuffer } from "@/lib/storage-recovery";
import { initSessionToken } from "@/lib/query-client";

// Timeout di sicurezza dello splash: allo scadere l'app passa SEMPRE a uno
// stato renderizzabile (eventualmente degradato) invece di restare sul casco.
const SPLASH_SAFETY_TIMEOUT_MS = 5000;
// Il caricamento del token non deve mai bloccare il bootstrap: se AsyncStorage
// è lento/saturo al cold start, dopo questo timeout proseguiamo comunque.
const TOKEN_INIT_TIMEOUT_MS = 3000;
// La pulizia dello storage legacy può essere I/O-pesante: la limitiamo nel tempo
// così non resta appesa indefinitamente anche se gira fuori dal percorso critico.
const PURGE_TIMEOUT_MS = 8000;

/**
 * Esegue una promise con un timeout: se non si risolve entro `ms` restituisce
 * `fallback` invece di restare appesa. Non lancia mai. Serve a impedire che
 * un'operazione di avvio lenta (storage saturo, I/O bloccato) tenga in ostaggio
 * il bootstrap durante lo splash al cold start.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(fallback);
      }
    }, ms);
    promise
      .then((value) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }
      })
      .catch(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(fallback);
        }
      });
  });
}

export function useAppBootstrap() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const [ready, setReady] = useState(false);
  const [tokenReady, setTokenReady] = useState(false);

  // ── Inizializzazione token ──────────────────────────────────────────────
  // initSessionToken DEVE essere la primissima operazione: useOtaAutoUpdate e
  // DeviceMetricsReporter vengono montati subito dopo e devono trovare il token
  // già in cache per non inviare richieste anonime al cold start.
  // È protetta da un timeout così tokenReady diventa SEMPRE true (anche se lo
  // storage si blocca) e i consumer non restano appesi.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await withTimeout(initSessionToken(), TOKEN_INIT_TIMEOUT_MS, null);
      if (!cancelled) setTokenReady(true);
      // Beacon best-effort, non bloccanti: non devono mai ritardare il bootstrap.
      withTimeout(recoverLastBeacon(), TOKEN_INIT_TIMEOUT_MS, undefined).catch(() => {});
      sendStartupBeacon("layout_mount");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Gate fonts → ready ──────────────────────────────────────────────────
  // Allo scadere del timeout di sicurezza l'app passa comunque a uno stato
  // renderizzabile. Il fallback NON esegue più operazioni rischiose (niente
  // pulizia storage / OTA qui dentro): si limita a sbloccare il render così che
  // lo splash non possa restare appeso e il processo non venga chiuso.
  useEffect(() => {
    let done = false;
    const openGate = (reason: "fonts" | "timeout") => {
      if (done) return;
      done = true;
      if (reason === "timeout") {
        sendStartupBeacon("splash_safety_timeout");
      }
      setReady(true);
      SplashScreen.hideAsync().catch(() => {});
    };

    const timeout = setTimeout(() => openGate("timeout"), SPLASH_SAFETY_TIMEOUT_MS);

    if (fontsLoaded || fontError) {
      sendStartupBeacon("fonts_ready");
      clearTimeout(timeout);
      openGate("fonts");
    }

    return () => clearTimeout(timeout);
  }, [fontsLoaded, fontError]);

  // ── Pulizia storage legacy (fuori dal percorso critico) ─────────────────
  // Spostata DOPO che l'app è interattiva (ready) ed eseguita via
  // InteractionManager con guardia try/catch + timeout: uno storage saturo o
  // un I/O lento non possono più crashare il processo durante lo splash.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const handle = InteractionManager.runAfterInteractions(() => {
      withTimeout(purgeLegacyGpsBuffer(), PURGE_TIMEOUT_MS, 0)
        .then((purged) => {
          if (!cancelled && purged > 0) {
            sendStartupBeacon("legacy_gps_buffer_purged", { keys: purged });
          }
        })
        .catch(() => {
          // no-op: la pulizia legacy è best-effort e idempotente.
        });
    });
    return () => {
      cancelled = true;
      handle.cancel?.();
    };
  }, [ready]);

  return { ready, tokenReady, fontsLoaded, fontError };
}

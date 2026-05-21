import React, { useEffect } from "react";
import { AppState, Platform } from "react-native";
import * as Updates from "expo-updates";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { triggerOtaCheck, OTA_PENDING_KEY, reportOtaEvent } from "@/lib/ota-check";
import { initOtaHardening } from "@/lib/ota-hardening";

export function OtaStartupChecker() {
  useEffect(() => {
    // Task #1357 — hardening OTA: device-id, heartbeat, error-recovery listener.
    initOtaHardening().catch(() => {});

    let timerHandle: ReturnType<typeof setTimeout> | null = null;
    let mounted = true;

    const doStartup = async () => {
      // Fix: leggi il flag persistente scritto da ota-check.ts dopo ogni fetch.
      // Se presente, significa che l'update era già stato scaricato nella sessione
      // precedente ma reloadAsync() nel background listener non è scattato
      // (comportamento inaffidabile su Android). Lo applichiamo subito, prima
      // che l'utente veda qualsiasi schermata, senza aspettare 3 secondi.
      if (!__DEV__ && Platform.OS !== "web") {
        try {
          const pending = await AsyncStorage.getItem(OTA_PENDING_KEY);
          if (pending === "1" && mounted) {
            // Rimuoviamo la chiave solo DOPO che reloadAsync ha avuto successo.
            // reloadAsync non ritorna in condizioni normali (l'app si riavvia).
            // Se lancia un errore, la chiave rimane → il prossimo cold start riprova.
            Updates.reloadAsync()
              .then(() => {
                AsyncStorage.removeItem(OTA_PENDING_KEY).catch(() => {});
              })
              .catch((err: unknown) => {
                const msg = err instanceof Error ? err.message : String(err);
                reportOtaEvent({
                  phase: "reload-failed",
                  source: "startup",
                  currentUpdateId: Updates.updateId ?? "embedded",
                  runtimeVersion: Updates.runtimeVersion ?? "unknown",
                  error: `[reload-failed/startup] ${msg}`.substring(0, 500),
                });
              });
            return; // non schedula il check normale
          }
        } catch {}
      }
      if (!mounted) return;
      timerHandle = setTimeout(() => {
        triggerOtaCheck("startup");
      }, 3000);
    };

    doStartup();

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") triggerOtaCheck("appstate");
    });
    return () => {
      mounted = false;
      if (timerHandle) clearTimeout(timerHandle);
      sub.remove();
    };
  }, []);

  return null;
}

import React, { useEffect } from "react";
import { AppState } from "react-native";
import { triggerOtaCheck } from "@/lib/ota-check";
import { initOtaHardening } from "@/lib/ota-hardening";
import { applyPendingOtaIfNeeded } from "@/lib/ota-startup";

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
      const triggered = await applyPendingOtaIfNeeded(() => mounted);
      if (triggered) return; // non schedula il check normale

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

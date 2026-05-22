import React, { useEffect } from "react";
import { AppState } from "react-native";
import { triggerOtaCheck } from "@/lib/ota-check";
import { initOtaHardening } from "@/lib/ota-hardening";
import { applyPendingOtaIfNeeded } from "@/lib/ota-startup";
import { getApiUrl } from "@/lib/query-client";

const HEALTH_POLL_MAX_ATTEMPTS = 10;
const HEALTH_POLL_INTERVAL_MS = 500;

async function waitForBackend(): Promise<void> {
  const healthUrl = new URL("/api/health", getApiUrl()).toString();
  for (let i = 0; i < HEALTH_POLL_MAX_ATTEMPTS; i++) {
    try {
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {
      // non risponde ancora, continua polling
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
  }
  // Se il backend non risponde entro i tentativi massimi, procediamo comunque
}

export function OtaStartupChecker() {
  useEffect(() => {
    initOtaHardening().catch(() => {});

    let mounted = true;

    const doStartup = async () => {
      // Il flag OTA_PENDING_KEY viene applicato immediatamente (cold start),
      // prima di qualsiasi polling, come da specifica.
      const triggered = await applyPendingOtaIfNeeded(() => mounted);
      if (triggered) return;

      if (!mounted) return;

      // Polling attivo su /api/health invece del delay fisso di 3s.
      // Non appena il backend risponde, il check OTA viene eseguito subito.
      await waitForBackend();

      if (!mounted) return;
      triggerOtaCheck("startup");
    };

    doStartup();

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") triggerOtaCheck("appstate");
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return null;
}

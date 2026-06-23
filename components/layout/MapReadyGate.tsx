import React, { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMapConfig } from "@/lib/map-context";
import { sendStartupBeacon } from "@/lib/startup-beacon";
import { loadTelemetryAlwaysActive } from "@/lib/telemetry-prefs";

// Anti-blocco: il gate è pass-through immediato. map-context ha già default
// sicuri (tile di fallback), quindi l'app resta usabile mentre le 3 query di
// configurazione mappe si risolvono in background. In precedenza un overlay
// opaco bloccava l'interazione finché le query non erano pronte: dopo il grant
// della posizione l'utente percepiva uno schermo bloccato (spinner full-screen)
// perché il timeout di sicurezza si azzerava ad ogni cambio di dependency.
// Manteniamo SOLO i beacon per il monitoring delle regressioni.
export const MAP_READY_GATE_TIMEOUT_MS = 6000;

type UnblockReason = "queries_resolved" | "timeout" | "no_user";

export function MapReadyGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { isLoading } = useMapConfig();
  const beaconState = useRef<string>("");
  const unblockEmitted = useRef(false);

  const emitUnblock = useCallback((reason: UnblockReason) => {
    if (unblockEmitted.current) return;
    unblockEmitted.current = true;
    sendStartupBeacon("map_ready_gate_unblock_reason", { reason });
  }, []);

  useEffect(() => {
    sendStartupBeacon("map_ready_gate_enter", { hasUser: !!user, mapLoading: isLoading });
    // Idrata la preferenza "Telemetria sempre attiva" al bootstrap così che il
    // kill-switch venga rispettato/ignorato in modo coerente già dai primi eventi.
    void loadTelemetryAlwaysActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user && isLoading) {
      if (beaconState.current !== "loading") {
        beaconState.current = "loading";
        sendStartupBeacon("map_ready_gate_loading");
      }
    } else if (beaconState.current !== "pass") {
      beaconState.current = "pass";
      sendStartupBeacon("map_ready_gate_pass", { hasUser: !!user });
    }
  }, [user, isLoading]);

  // Registra perché il gate è "sbloccato" (passa i children senza attese
  // percepibili): nessun utente, oppure le query sono già risolte.
  useEffect(() => {
    if (!user) {
      emitUnblock("no_user");
    } else if (!isLoading) {
      emitUnblock("queries_resolved");
    }
  }, [user, isLoading, emitUnblock]);

  // Beacon di timeout per monitoring: se le query restano in loading oltre la
  // soglia registriamo l'evento (il gate non blocca comunque la UI).
  useEffect(() => {
    if (!user || !isLoading) return;
    const timeout = setTimeout(() => {
      sendStartupBeacon("map_ready_gate_timeout");
      emitUnblock("timeout");
    }, MAP_READY_GATE_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [user, isLoading, emitUnblock]);

  return <>{children}</>;
}

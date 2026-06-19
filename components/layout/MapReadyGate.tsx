import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useAuth } from "@/lib/auth-context";
import { useMapConfig } from "@/lib/map-context";
import { useTheme } from "@/lib/theme-context";
import { sendStartupBeacon } from "@/lib/startup-beacon";
import { loadTelemetryAlwaysActive } from "@/lib/telemetry-prefs";

// Anti-blocco: se la config mappe tarda troppo, sblocchiamo comunque la UI dopo
// questo timeout. map-context ha già default sicuri (tile di fallback), quindi
// l'app resta usabile in stato degradato invece di restare appesa sul loader al
// cold start (causa potenziale di chiusura automatica sullo splash).
export const MAP_READY_GATE_TIMEOUT_MS = 6000;

export function MapReadyGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { isLoading } = useMapConfig();
  const { colors } = useTheme();
  const beaconState = useRef<string>("");
  const [forcePass, setForcePass] = useState(false);

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

  useEffect(() => {
    if (!user || !isLoading || forcePass) return;
    const timeout = setTimeout(() => {
      sendStartupBeacon("map_ready_gate_timeout");
      setForcePass(true);
    }, MAP_READY_GATE_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [user, isLoading, forcePass]);

  if (user && isLoading && !forcePass) {
    return (
      <View style={[styles.mapGateLoader, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  mapGateLoader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

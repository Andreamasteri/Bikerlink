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

  const showOverlay = user && isLoading && !forcePass;

  // Rendiamo SEMPRE i children (inclusa la Stack di navigazione) così che
  // Expo Router possa risolvere le route durante il caricamento della config
  // mappe. L'overlay opaco blocca l'interazione finché non siamo pronti.
  // FIX: in precedenza children non venivano renderizzati durante il loading →
  // la Stack veniva smontata → Expo Router mostrava +not-found e non tornava
  // automaticamente alla route corretta quando la Stack rimontava.
  return (
    <View style={styles.container}>
      {children}
      {showOverlay && (
        <View
          style={[styles.overlay, { backgroundColor: colors.background }]}
          pointerEvents="box-only"
        >
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
});

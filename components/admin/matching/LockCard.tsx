/**
 * Task #2527 — LockCard.
 * Stato del lock `isMatchingRunning` del motore.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export interface LockState {
  isRunning: boolean;
  lastStartAt: number | null;
  lastStartIso: string | null;
  elapsedMs: number | null;
}

interface Props {
  lockState: LockState | undefined;
}

export function LockCard({ lockState }: Props) {
  return (
    <View style={styles.card}>
      <MaterialCommunityIcons
        name={lockState?.isRunning ? "lock" : "lock-open-variant"}
        size={20}
        color={lockState?.isRunning ? Colors.warning : Colors.success}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>
          Lock engine: {lockState?.isRunning ? "BLOCCATO" : "libero"}
        </Text>
        {lockState?.isRunning && lockState.elapsedMs != null && (
          <Text style={styles.subtitle}>
            In esecuzione da {Math.floor(lockState.elapsedMs / 1000)}s
            {lockState.elapsedMs > 5 * 60 * 1000 && " — sospetto stallo"}
          </Text>
        )}
        {!lockState?.isRunning && lockState?.lastStartIso && (
          <Text style={styles.subtitle}>
            Ultimo avvio: {formatDate(lockState.lastStartIso)}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: Colors.surface, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 12,
  },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
});

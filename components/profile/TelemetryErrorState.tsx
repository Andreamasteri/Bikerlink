import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

/**
 * Task #53 — quando GET /api/telemetry/stats fallisce (es. sotto pressione
 * del pool DB), il pannello Telemetria non deve sparire silenziosamente:
 * mostriamo un piccolo stato di errore con retry così l'utente capisce che
 * è un problema temporaneo e non che i suoi dati sono andati persi.
 */
export function TelemetryErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.card} onPress={onRetry} activeOpacity={0.7}>
        <Ionicons name="cloud-offline-outline" size={18} color="#e74c3c" />
        <View style={styles.textCol}>
          <Text style={styles.title}>Telemetria non disponibile</Text>
          <Text style={styles.hint}>Tocca per riprovare</Text>
        </View>
        <Ionicons name="refresh" size={16} color={Colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 16, marginTop: 4 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e74c3c33",
  },
  textCol: { flex: 1, gap: 2 },
  title: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.text },
  hint: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#e74c3c" },
});

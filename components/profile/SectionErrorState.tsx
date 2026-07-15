import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

/**
 * Task #53 / #82 — retry card riutilizzabile per le sezioni del profilo il cui
 * fetch dati fallisce (es. sotto pressione del pool DB). Invece di far sparire
 * silenziosamente l'intera sezione — lasciando credere all'utente che i suoi
 * dati siano andati persi — mostriamo una card compatta con retry così è chiaro
 * che si tratta di un problema temporaneo.
 */
export function SectionErrorState({
  title,
  hint = "Tocca per riprovare",
  onRetry,
}: {
  title: string;
  hint?: string;
  onRetry: () => void;
}) {
  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.card} onPress={onRetry} activeOpacity={0.7}>
        <Ionicons name="cloud-offline-outline" size={18} color="#e74c3c" />
        <View style={styles.textCol}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.hint}>{hint}</Text>
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

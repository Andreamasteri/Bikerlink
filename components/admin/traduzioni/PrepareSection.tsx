import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { StepStatus } from "./StepCard";

interface PrepareSectionProps {
  prepareStatus: StepStatus;
  prepareResult: string;
  onPrepare: () => void;
  t: (key: string) => string;
}

export function PrepareSection({
  prepareStatus,
  prepareResult,
  onPrepare,
}: PrepareSectionProps) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>1</Text>
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={styles.cardTitle}>Prepara generazione</Text>
          <Text style={styles.cardDesc}>Scansiona il file IT e conta tutte le stringhe da esportare.</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.button, prepareStatus === "loading" && styles.buttonDisabled]}
        onPress={onPrepare}
        disabled={prepareStatus === "loading"}
        activeOpacity={0.7}
      >
        {prepareStatus === "loading" ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.buttonText}>Prepara</Text>
        )}
      </TouchableOpacity>

      {prepareResult ? (
        <View
          style={[
            styles.resultBox,
            prepareStatus === "success" && styles.resultBoxSuccess,
            prepareStatus === "error" && styles.resultBoxError,
          ]}
        >
          <MaterialCommunityIcons
            name={prepareStatus === "success" ? "check-circle-outline" : "alert-circle-outline"}
            size={16}
            color={prepareStatus === "success" ? "#4CAF50" : "#F44336"}
          />
          <Text
            style={[
              styles.resultText,
              prepareStatus === "success" ? styles.resultTextSuccess : styles.resultTextError,
            ]}
          >
            {prepareResult}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

import { TouchableOpacity, ActivityIndicator } from "react-native";

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },
  cardHeaderText: { flex: 1 },
  stepBadge: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.accent,
    alignItems: "center", justifyContent: "center",
  },
  stepBadgeText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  cardTitle: { fontSize: 15, color: Colors.text, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  cardDesc: { fontSize: 12, color: Colors.textSecondary, fontFamily: "Inter_400Regular", lineHeight: 16 },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  resultBox: {
    marginTop: 10, paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.background,
  },
  resultBoxSuccess: { backgroundColor: "#4CAF5015" },
  resultBoxError: { backgroundColor: "#F4433615" },
  resultText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  resultTextSuccess: { color: "#4CAF50" },
  resultTextError: { color: "#F44336" },
});

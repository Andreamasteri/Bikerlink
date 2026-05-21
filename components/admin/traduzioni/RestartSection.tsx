import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { StepStatus } from "./StepCard";

interface RestartSectionProps {
  restartStatus: StepStatus;
  restartResult: string;
  onRestart: () => void;
  t: (key: string) => string;
}

export function RestartSection({
  restartStatus,
  restartResult,
  onRestart,
  t,
}: RestartSectionProps) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View
          style={[
            styles.stepBadge,
            restartStatus === "success" && styles.stepBadgeSuccess,
            restartStatus === "error" && styles.stepBadgeError,
          ]}
        >
          <Text style={styles.stepBadgeText}>4</Text>
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={styles.cardTitle}>Riavvia Backend</Text>
          <Text style={styles.cardDesc}>
            Riavvia il server per caricare le nuove traduzioni in lib/i18n/.
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.button, restartStatus === "loading" && styles.buttonDisabled]}
        onPress={onRestart}
        disabled={restartStatus === "loading"}
        activeOpacity={0.7}
      >
        {restartStatus === "loading" ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <MaterialCommunityIcons name="restart" size={18} color="#fff" />
            <Text style={styles.buttonText}>Riavvia Backend</Text>
          </>
        )}
      </TouchableOpacity>

      {restartResult ? (
        <View
          style={[
            styles.resultBox,
            restartStatus === "success" && styles.resultBoxSuccess,
            restartStatus === "error" && styles.resultBoxError,
          ]}
        >
          <MaterialCommunityIcons
            name={restartStatus === "success" ? "check-circle-outline" : "alert-circle-outline"}
            size={16}
            color={restartStatus === "success" ? "#4CAF50" : "#F44336"}
          />
          <Text
            style={[
              styles.resultText,
              restartStatus === "success" ? styles.resultTextSuccess : styles.resultTextError,
            ]}
          >
            {restartResult}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

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
  stepBadgeSuccess: { backgroundColor: "#4CAF50" },
  stepBadgeError: { backgroundColor: "#F44336" },
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

import React from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface TelemetryFiltersProps {
  target_km: number;
  targetInput: string;
  setTargetInput: (val: string) => void;
  onSaveTarget: () => void;
  saving: boolean;
  progressPct: number;
}

export function TelemetryFilters({
  target_km,
  targetInput,
  setTargetInput,
  onSaveTarget,
  saving,
  progressPct,
}: TelemetryFiltersProps) {
  return (
    <>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Progresso collettivo</Text>
        <Text style={styles.progressNote}>
          {progressPct}% dell'obiettivo di {target_km} km raggiunto a livello globale
        </Text>
        <View style={styles.progressBg}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.min(progressPct, 100)}%` as `${number}%`,
                backgroundColor: progressPct >= 100 ? "#22c55e" : Colors.accent,
              },
            ]}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Configurazione soglia</Text>
        <Text style={styles.settingDesc}>
          Km necessari per sbloccare i percorsi personalizzati (attualmente:{" "}
          <Text style={{ color: Colors.accent, fontFamily: "Inter_700Bold" }}>
            {target_km} km
          </Text>
          ).
        </Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={targetInput}
            onChangeText={setTargetInput}
            keyboardType="numeric"
            placeholder="es. 400"
            placeholderTextColor={Colors.textSecondary}
            returnKeyType="done"
            onSubmitEditing={onSaveTarget}
          />
          <Text style={styles.inputSuffix}>km</Text>
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={onSaveTarget}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Ionicons name="checkmark" size={18} color="#000" />
            )}
            <Text style={styles.saveBtnText}>Salva</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
    marginBottom: 12,
  },
  progressNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  progressBg: {
    height: 10,
    backgroundColor: Colors.border,
    borderRadius: 5,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 5,
  },
  settingDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 12,
    lineHeight: 18,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.text,
  },
  inputSuffix: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  saveBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#000",
  },
});

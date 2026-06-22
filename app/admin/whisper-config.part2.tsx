import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { styles } from "./whisper-config.styles";
import type { DiagStep } from "./whisper-config";

export function WhisperDiagSteps({
  diagSteps,
  copyDiagLog,
}: {
  diagSteps: DiagStep[];
  copyDiagLog: () => void;
}) {
  return (
    <View style={styles.diagReport}>
      <View style={styles.diagReportHeader}>
        <MaterialCommunityIcons name="clipboard-list-outline" size={16} color={Colors.text} />
        <Text style={styles.diagReportTitle}>Report diagnostica</Text>
        <TouchableOpacity style={styles.copyLogBtn} onPress={copyDiagLog}>
          <MaterialCommunityIcons name="content-copy" size={14} color={Colors.textSecondary} />
          <Text style={styles.copyLogText}>Copia log</Text>
        </TouchableOpacity>
      </View>
      {diagSteps.map((step, idx) => (
        <View key={idx} style={[styles.diagStep, idx > 0 && styles.diagStepBorder]}>
          <Text style={[styles.diagStepIcon, { color: step.ok ? "#22C55E" : "#ef4444" }]}>
            {step.ok ? "✅" : "❌"}
          </Text>
          <View style={styles.diagStepBody}>
            <Text style={styles.diagStepLabel}>
              {step.label}
              {step.latency_ms != null ? (
                <Text style={styles.diagStepLatency}> — {step.latency_ms}ms</Text>
              ) : null}
            </Text>
            <Text style={styles.diagStepDetail}>{step.detail}</Text>
          </View>
        </View>
      ))}
      {diagSteps.length === 0 && (
        <Text style={styles.diagStepDetail}>Nessun dato restituito.</Text>
      )}
    </View>
  );
}

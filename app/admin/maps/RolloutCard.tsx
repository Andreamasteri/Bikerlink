import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import type { MapsRollout } from "@shared/maps-config";

interface RolloutCardProps {
  rollout: MapsRollout;
  isPending: boolean;
  onRolloutChange: (rollout: MapsRollout) => void;
}

const OPTIONS: Array<{ value: MapsRollout; label: string; description: string; icon: React.ComponentProps<typeof Ionicons>["name"] }> = [
  { value: "disabled", label: "Disabilitato", description: "Solo admin vede i renderer sperimentali", icon: "lock-closed-outline" },
  { value: "tester", label: "Solo Map Tester", description: "Utenti con flag Map Tester abilitato", icon: "flask-outline" },
  { value: "all", label: "Tutti", description: "Tutti gli utenti autenticati", icon: "globe-outline" },
];

export function RolloutCard({ rollout, isPending, onRolloutChange }: RolloutCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="toggle-outline" size={18} color={Colors.accent} />
        <Text style={styles.title}>Rollout Sistema Mappe</Text>
        {isPending && <ActivityIndicator size="small" color={Colors.accent} style={styles.spinner} />}
      </View>
      <Text style={styles.subtitle}>Controlla chi può accedere ai nuovi renderer e routing engine.</Text>

      {OPTIONS.map((opt) => {
        const isSelected = rollout === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.option, isSelected && styles.optionSelected]}
            onPress={() => !isPending && onRolloutChange(opt.value)}
            activeOpacity={0.7}
            disabled={isPending}
          >
            <View style={styles.optionLeft}>
              <Ionicons
                name={opt.icon}
                size={18}
                color={isSelected ? Colors.accent : Colors.textSecondary}
              />
              <View style={styles.optionText}>
                <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>{opt.label}</Text>
                <Text style={styles.optionDesc}>{opt.description}</Text>
              </View>
            </View>
            {isSelected && <Ionicons name="checkmark-circle" size={20} color={Colors.accent} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text },
  spinner: { marginLeft: "auto" },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginBottom: 12 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
    backgroundColor: Colors.background,
  },
  optionSelected: { borderColor: Colors.accent, backgroundColor: Colors.accent + "11" },
  optionLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  optionText: { flex: 1 },
  optionLabel: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.text },
  optionLabelSelected: { color: Colors.accent },
  optionDesc: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
});

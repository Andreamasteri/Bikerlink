import React from "react";
import { View, Text, StyleSheet, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface Props {
  enabled: boolean | undefined;
  saving: boolean;
  onToggle: (value: boolean) => void;
}

export function SensorsGlobalCard({ enabled, saving, onToggle }: Props) {
  const isOn = enabled !== false;
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.iconBg}>
          <Ionicons name="pulse" size={18} color={isOn ? Colors.accent : "#ef4444"} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Sensori Globali</Text>
          <Text style={styles.cardDesc}>
            Abilita/disabilita la raccolta sensori (accelerometro, piega, G-force) per tutti gli utenti
          </Text>
        </View>
        <Switch
          value={isOn}
          onValueChange={onToggle}
          disabled={saving}
          trackColor={{ false: "#ef444440", true: Colors.accent + "80" }}
          thumbColor={isOn ? Colors.accent : "#ef4444"}
        />
      </View>
      {!isOn && (
        <View style={styles.warning}>
          <Ionicons name="warning" size={14} color="#ef4444" />
          <Text style={styles.warningText}>
            Sensori disattivati per tutti gli utenti. I dati accelerometro non vengono raccolti.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  cardDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
    marginTop: 2,
  },
  warning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "#ef444415",
    borderRadius: 8,
    padding: 10,
  },
  warningText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#ef4444",
    flex: 1,
    lineHeight: 16,
  },
});

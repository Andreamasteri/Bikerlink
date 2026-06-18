import React from "react";
import { View as RNView, Text as RNText, StyleSheet as RNStyleSheet, Switch as RNSwitch } from "react-native";
import { Ionicons as IoniconsSet } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const styles = RNStyleSheet.create({
  paidCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.warning,
  },
  synecoHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  synecoInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  synecoLabel: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },
  synecoDesc: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 8 },
});

interface UptimeSectionProps {
  uptimeWidgetEnabled: boolean | null;
  onUptimeToggle: (val: boolean) => void;
}

export function UptimeSection({
  uptimeWidgetEnabled,
  onUptimeToggle,
}: UptimeSectionProps) {
  const isEnabled = uptimeWidgetEnabled === true;
  return (
    <RNView style={styles.paidCard}>
      <RNView style={styles.synecoHeader}>
        <RNView style={styles.synecoInfo}>
          <IoniconsSet name="pulse" size={20} color={Colors.accent} />
          <RNText style={styles.synecoLabel}>Widget Uptime</RNText>
        </RNView>
        <RNSwitch
          value={isEnabled}
          onValueChange={onUptimeToggle}
          trackColor={{ false: Colors.border, true: Colors.accent }}
          thumbColor={isEnabled ? Colors.text : Colors.textSecondary}
        />
      </RNView>
      <RNText style={styles.synecoDesc}>
        {isEnabled
          ? "Pannello fluttuante uptime attivo — visibile solo agli admin"
          : "Pannello fluttuante uptime nascosto"}
      </RNText>
    </RNView>
  );
}

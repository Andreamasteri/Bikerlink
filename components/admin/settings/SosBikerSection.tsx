import React from "react";
import { View, Text, StyleSheet, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

const styles = StyleSheet.create({
  sosCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sosHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sosInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sosLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  sosDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
});

interface SosBikerSectionProps {
  enabled: boolean;
  onToggle: (val: boolean) => void;
  isPending: boolean;
}

export function SosBikerSection({ enabled, onToggle, isPending }: SosBikerSectionProps) {
  const t = useT();
  return (
    <View style={styles.sosCard}>
      <View style={styles.sosHeader}>
        <View style={styles.sosInfo}>
          <Ionicons name="warning" size={20} color="#FF6600" />
          <Text style={styles.sosLabel}>SOS Biker</Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ false: Colors.border, true: "#FF6600" }}
          thumbColor={enabled ? Colors.text : Colors.textSecondary}
          disabled={isPending}
        />
      </View>
      <Text style={styles.sosDesc}>
        {enabled ? t("admin.sosActive") : t("admin.sosInactive")}
      </Text>
    </View>
  );
}

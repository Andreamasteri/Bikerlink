import React from "react";
import { View, Text, StyleSheet, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

const styles = StyleSheet.create({
  synecoCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  synecoHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  synecoInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  synecoLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  synecoDesc: {
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
    <View style={styles.synecoCard}>
      <View style={styles.synecoHeader}>
        <View style={styles.synecoInfo}>
          <Ionicons name="warning" size={20} color="#FF6600" />
          <Text style={styles.synecoLabel}>SOS Biker</Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ false: Colors.border, true: "#FF6600" }}
          thumbColor={enabled ? Colors.text : Colors.textSecondary}
          disabled={isPending}
        />
      </View>
      <Text style={styles.synecoDesc}>
        {enabled ? t("admin.sosActive") : t("admin.sosInactive")}
      </Text>
    </View>
  );
}

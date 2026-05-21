import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  color?: string;
}

export function StatCard({
  label,
  value,
  icon,
  color,
}: StatCardProps) {
  const c = color ?? Colors.accent;
  return (
    <View style={[styles.statCard, { borderLeftColor: c }]}>
      <MaterialCommunityIcons name={icon as any} size={20} color={c} />
      <View style={styles.statCardText}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  statCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 4,
  },
  statCardText: {
    flex: 1,
  },
  statValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});

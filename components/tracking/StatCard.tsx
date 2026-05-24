import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface StatCardProps {
  icon: string;
  color: string;
  value: string;
  label: string;
}

export function StatCard({
  icon,
  color,
  value,
  label,
}: StatCardProps) {
  return (
    <View style={styles.statCard}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- icon name from data */}
      <Ionicons name={icon as any} size={16} color={color} />
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statCard: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 70,
  },
  statValue: {
    color: "#FFFFFF",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginTop: 4,
  },
  statLabel: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
    textTransform: "uppercase",
  },
});

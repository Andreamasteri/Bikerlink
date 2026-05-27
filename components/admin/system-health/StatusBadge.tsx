// Task #2533 — Badge stato sistema (green/yellow/orange/red).
import React from "react";
import { View, Text, StyleSheet } from "react-native";

type Status = "green" | "yellow" | "orange" | "red";

const COLOR: Record<Status, string> = {
  green: "#22c55e", yellow: "#eab308", orange: "#f97316", red: "#ef4444",
};
const LABEL: Record<Status, string> = {
  green: "OK", yellow: "Attenzione", orange: "Degradato", red: "Critico",
};

export function StatusBadge({ status, score }: { status: Status; score: number }) {
  const color = COLOR[status] ?? "#6b7280";
  return (
    <View style={[styles.wrap, { backgroundColor: `${color}22`, borderColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]}>{LABEL[status] ?? status}</Text>
      <Text style={styles.score}>{score}/100</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, alignSelf: "flex-start",
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { fontWeight: "700" as const, fontSize: 14 },
  score: { color: "#9ca3af", fontSize: 13, marginLeft: 4 },
});

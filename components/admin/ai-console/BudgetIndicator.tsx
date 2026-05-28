// Task #2641 — Indicatore budget mensile (placeholder client-side).
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useAiBudget } from "@/hooks/admin/ai-console/useAiBudget";

export default function BudgetIndicator() {
  const colors = useColors();
  const { data } = useAiBudget();
  if (!data) return null;

  const pct = data.percent;
  const barColor = pct >= 90 ? colors.error : pct >= 70 ? colors.warning : colors.success;

  return (
    <View style={[styles.wrap, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Budget {data.monthLabel}</Text>
        <Text style={[styles.value, { color: colors.text }]}>
          ${data.spentUsd.toFixed(2)} / ${data.budgetUsd.toFixed(0)}
        </Text>
      </View>
      <View style={[styles.bar, { backgroundColor: colors.surfaceLight }]}>
        <View style={[styles.fill, { backgroundColor: barColor, width: `${Math.min(100, pct)}%` }]} />
      </View>
      {data.approx ? (
        <Text style={[styles.approx, { color: colors.textSecondary }]}>≈ stima client</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 10, borderWidth: 1, padding: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 },
  label: { fontFamily: "Inter_500Medium", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  value: { fontFamily: "Inter_700Bold", fontSize: 13 },
  bar: { height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
  approx: { fontFamily: "Inter_400Regular", fontSize: 9, marginTop: 4, fontStyle: "italic", textAlign: "right" },
});

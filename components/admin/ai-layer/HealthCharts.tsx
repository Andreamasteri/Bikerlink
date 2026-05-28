// Task #2657 — Mini-grafici health (bar puri, no librerie chart).
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";
import type { AiHealth } from "@/hooks/admin/ai-layer/useAiHealth";

export default function HealthCharts(props: { health: AiHealth | undefined }) {
  const colors = useColors();
  const h = props.health;
  if (!h) return <Text style={{ color: colors.textSecondary, padding: 12 }}>Caricamento health…</Text>;

  const maxAvg = Math.max(1, ...h.perAi.map((p) => p.avgDecisionMs));
  const maxDec = Math.max(1, ...h.perAi.map((p) => p.decisions));

  return (
    <View>
      <View style={styles.kpiRow}>
        <Kpi label="conflitti / decisioni" value={`${h.ratios.conflictsPerDecisionPct}%`} color={h.ratios.conflictsPerDecisionPct > 5 ? colors.warning : colors.text} />
        <Kpi label="% override admin" value={`${h.ratios.adminOverridePct}%`} color={h.ratios.adminOverridePct > 20 ? colors.error : colors.text} />
        <Kpi label="conflitti aperti" value={`${h.conflicts.open}`} color={h.conflicts.open > 0 ? colors.warning : colors.text} />
      </View>

      <Text style={[styles.section, { color: colors.text }]}>Latenza media decisioni (ms)</Text>
      {h.perAi.map((p) => (
        <View key={`avg-${p.aiName}`} style={styles.barRow}>
          <Text style={[styles.barLabel, { color: colors.text }]}>{p.aiName}</Text>
          <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
            <View style={[styles.barFill, { width: `${(p.avgDecisionMs / maxAvg) * 100}%`, backgroundColor: colors.primary }]} />
          </View>
          <Text style={[styles.barValue, { color: colors.textSecondary }]}>{p.avgDecisionMs}ms</Text>
        </View>
      ))}

      <Text style={[styles.section, { color: colors.text }]}>Decisioni nelle ultime {h.sinceHours}h</Text>
      {h.perAi.map((p) => (
        <View key={`dec-${p.aiName}`} style={styles.barRow}>
          <Text style={[styles.barLabel, { color: colors.text }]}>{p.aiName}</Text>
          <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
            <View style={[styles.barFill, { width: `${(p.decisions / maxDec) * 100}%`, backgroundColor: colors.success }]} />
          </View>
          <Text style={[styles.barValue, { color: colors.textSecondary }]}>{p.decisions}</Text>
        </View>
      ))}

      <Text style={[styles.section, { color: colors.text }]}>Heartbeat</Text>
      {h.perAi.map((p) => {
        const stale = p.secondsSinceHeartbeat === null || p.secondsSinceHeartbeat > 300;
        return (
          <View key={`hb-${p.aiName}`} style={styles.hbRow}>
            <View style={[styles.hbDot, { backgroundColor: stale ? colors.error : colors.success }]} />
            <Text style={[styles.hbName, { color: colors.text }]}>{p.aiName}</Text>
            <Text style={[styles.hbValue, { color: colors.textSecondary }]}>
              {p.secondsSinceHeartbeat === null ? "mai" : `${p.secondsSinceHeartbeat}s fa`}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
      <Text style={[styles.kpiLabel, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kpiRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  kpi: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(127,127,127,0.3)" },
  kpiValue: { fontSize: 18, fontWeight: "700" },
  kpiLabel: { fontSize: 10, opacity: 0.7, marginTop: 2, textAlign: "center" },
  section: { fontSize: 13, fontWeight: "700", marginTop: 12, marginBottom: 6 },
  barRow: { flexDirection: "row", alignItems: "center", marginVertical: 3 },
  barLabel: { width: 110, fontSize: 11 },
  barTrack: { flex: 1, height: 10, borderRadius: 5, overflow: "hidden", marginRight: 8 },
  barFill: { height: "100%", borderRadius: 5 },
  barValue: { width: 60, fontSize: 11, textAlign: "right" },
  hbRow: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  hbDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  hbName: { flex: 1, fontSize: 12 },
  hbValue: { fontSize: 11 },
});

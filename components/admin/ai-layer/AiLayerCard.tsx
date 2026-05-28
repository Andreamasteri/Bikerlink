// Task #2657 — Card riassuntiva per singola AI.
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

export interface AiLayerCardProps {
  aiName: string;
  events: number;
  decisions: number;
  criticals: number;
  conflictsOpen: number;
  lastActivityAt?: string | null;
  lastEventType?: string | null;
  healthScore?: number;
  paused?: boolean;
  pausedTtl?: number;
  onPause?: () => void;
  onResume?: () => void;
  onSelect?: () => void;
}

function fmtAgo(iso?: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s fa`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m fa`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h fa`;
  return `${Math.round(ms / 86_400_000)}g fa`;
}

export default function AiLayerCard(props: AiLayerCardProps) {
  const colors = useColors();
  const danger = props.criticals > 0 || props.conflictsOpen > 0;
  return (
    <TouchableOpacity
      testID={`ai-card-${props.aiName}`}
      onPress={props.onSelect}
      activeOpacity={0.85}
      style={[styles.card, { backgroundColor: colors.card, borderColor: danger ? colors.error : colors.border }]}
    >
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {props.aiName}
          </Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>
            ultima azione: {props.lastEventType ?? "—"} · {fmtAgo(props.lastActivityAt)}
          </Text>
        </View>
        {typeof props.healthScore === "number" ? (
          <View
            testID={`ai-health-${props.aiName}`}
            style={[styles.badge, {
              backgroundColor: (props.healthScore >= 80 ? colors.success : props.healthScore >= 50 ? colors.warning : colors.error) + "22",
              borderColor: props.healthScore >= 80 ? colors.success : props.healthScore >= 50 ? colors.warning : colors.error,
              marginRight: 6,
            }]}
          >
            <Ionicons name="pulse" size={12} color={props.healthScore >= 80 ? colors.success : props.healthScore >= 50 ? colors.warning : colors.error} />
            <Text style={[styles.badgeText, { color: props.healthScore >= 80 ? colors.success : props.healthScore >= 50 ? colors.warning : colors.error }]}>
              {props.healthScore}
            </Text>
          </View>
        ) : null}
        {props.paused ? (
          <View style={[styles.badge, { backgroundColor: colors.warning + "22", borderColor: colors.warning }]}>
            <Ionicons name="pause" size={12} color={colors.warning} />
            <Text style={[styles.badgeText, { color: colors.warning }]}>
              IN PAUSA{props.pausedTtl ? ` ${Math.round(props.pausedTtl / 60)}m` : ""}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.stats}>
        <Stat label="eventi" value={props.events} color={colors.text} />
        <Stat label="decisioni" value={props.decisions} color={colors.text} />
        <Stat label="critici" value={props.criticals} color={props.criticals > 0 ? colors.error : colors.text} />
        <Stat label="conflitti" value={props.conflictsOpen} color={props.conflictsOpen > 0 ? colors.warning : colors.text} />
      </View>
      <View style={styles.actions}>
        {props.paused ? (
          <TouchableOpacity
            testID={`ai-resume-${props.aiName}`}
            onPress={props.onResume}
            style={[styles.btn, { backgroundColor: colors.success }]}
          >
            <Ionicons name="play" size={14} color="#fff" />
            <Text style={styles.btnText}>Riattiva</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            testID={`ai-pause-${props.aiName}`}
            onPress={props.onPause}
            style={[styles.btn, { backgroundColor: colors.warning }]}
          >
            <Ionicons name="pause" size={14} color="#fff" />
            <Text style={styles.btnText}>Pausa</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center" },
  title: { fontSize: 16, fontWeight: "700" },
  sub: { fontSize: 11, marginTop: 2 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: "700" },
  stats: { flexDirection: "row", marginTop: 10, gap: 12 },
  stat: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 18, fontWeight: "700" },
  statLabel: { fontSize: 10, opacity: 0.7, marginTop: 2 },
  actions: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10, gap: 8 },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  btnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
});

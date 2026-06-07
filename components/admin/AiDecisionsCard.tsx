/**
 * Task #3191 — Card admin che mostra le decisioni recenti dell'AI Routing
 * Engine Selector: engine scelto, confidence, reason, modalità e provider.
 */
import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";

type AiDecisionMode = "ai-direct" | "ai-dual-compare" | "fallback-smart";

interface AiDecisionEntry {
  ts: number;
  mode: AiDecisionMode;
  chosenEngine: string;
  confidence: number | null;
  reason: string;
  provider: string | null;
  decisionLatencyMs: number;
  dualScores?: Record<string, number> | null;
}

const MODE_META: Record<AiDecisionMode, { label: string; color: string; icon: string }> = {
  "ai-direct": { label: "AI diretta", color: "#2196F3", icon: "robot-happy" },
  "ai-dual-compare": { label: "Confronto doppio", color: "#9C27B0", icon: "compare" },
  "fallback-smart": { label: "Fallback", color: Colors.warning, icon: "robot-confused" },
};

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s fa`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m fa`;
  return `${Math.round(m / 60)}h fa`;
}

export function AiDecisionsCard() {
  const { data, isLoading } = useQuery<{ decisions: AiDecisionEntry[] }>({
    queryKey: ["/api/admin/maps/ai-decisions"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/maps/ai-decisions?limit=20")).json(),
    refetchInterval: 15000,
    staleTime: 8000,
  });

  const decisions = data?.decisions ?? [];

  if (isLoading) {
    return (
      <View style={[styles.card, styles.center]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  if (decisions.length === 0) {
    return (
      <View style={[styles.card, styles.center]}>
        <MaterialCommunityIcons name="robot-outline" size={26} color={Colors.textSecondary} />
        <Text style={styles.emptyText}>
          Nessuna decisione AI registrata. Attiva l'engine "AI" e calcola un percorso.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {decisions.map((d, i) => {
        const meta = MODE_META[d.mode];
        return (
          <View key={`${d.ts}-${i}`} style={[styles.row, i > 0 && styles.rowDivider]}>
            <View style={styles.rowHeader}>
              <View style={[styles.badge, { backgroundColor: meta.color + "22", borderColor: meta.color }]}>
                <MaterialCommunityIcons name={meta.icon as never} size={13} color={meta.color} />
                <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
              </View>
              <Text style={styles.engine}>{d.chosenEngine}</Text>
              {d.confidence !== null && (
                <Text style={styles.confidence}>{Math.round(d.confidence * 100)}%</Text>
              )}
              <Text style={styles.ago}>{timeAgo(d.ts)}</Text>
            </View>
            <Text style={styles.reason} numberOfLines={3}>{d.reason}</Text>
            <View style={styles.metaRow}>
              {d.provider && <Text style={styles.metaText}>{d.provider}</Text>}
              <Text style={styles.metaText}>{d.decisionLatencyMs}ms</Text>
              {d.dualScores && (
                <Text style={styles.metaText}>
                  {Object.entries(d.dualScores).map(([e, s]) => `${e}:${s}`).join("  ")}
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
  },
  center: { alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 18 },
  emptyText: {
    fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "center",
  },
  row: { paddingVertical: 10 },
  rowDivider: { borderTopWidth: 1, borderTopColor: Colors.border },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, borderWidth: 1,
  },
  badgeText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  engine: { fontFamily: "Inter_700Bold", fontSize: 13, color: Colors.text, textTransform: "capitalize" },
  confidence: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.accent },
  ago: { marginLeft: "auto", fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary },
  reason: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text, marginTop: 6, lineHeight: 17 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 6 },
  metaText: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary },
});

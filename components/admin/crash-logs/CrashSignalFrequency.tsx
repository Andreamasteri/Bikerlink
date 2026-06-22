import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { SignalFrequencyItem } from "./CrashLogTypes";

function formatWindowSec(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function SignalFrequencySection({ items }: { items: SignalFrequencyItem[] }) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, 5);

  return (
    <View style={[freqStyles.container, { backgroundColor: colors.surface, borderColor: "#F59E0B40" }]}>
      <View style={freqStyles.header}>
        <MaterialCommunityIcons name="chart-timeline-variant-shimmer" size={14} color="#F59E0B" />
        <Text style={[freqStyles.title, { color: colors.textSecondary }]}>
          Ripetizione anomala (24h, min 3×)
        </Text>
        <View style={[freqStyles.countBadge, { backgroundColor: "#F59E0B22" }]}>
          <Text style={[freqStyles.countBadgeText, { color: "#F59E0B" }]}>{items.length}</Text>
        </View>
      </View>
      <Text style={[freqStyles.subtitle, { color: colors.textSecondary }]}>
        Pattern a mitragliatrice — stesso segnale per utente/sessione
      </Text>
      {shown.map((item, i) => {
        const meta = (() => {
          const m: Record<string, { label: string; color: string }> = {
            js_thread_freeze:      { label: "Thread Freeze", color: "#F59E0B" },
            gps_flood:             { label: "GPS Flood",     color: "#3B82F6" },
            memory_pressure:       { label: "RAM",           color: "#EF4444" },
            native_module_missing: { label: "Modulo Nativo", color: "#8B5CF6" },
          };
          return m[item.signal_type] ?? { label: item.signal_type, color: "#6B7280" };
        })();
        return (
          <View key={`${item.userId}-${item.sessionId ?? ""}-${i}`} style={freqStyles.row}>
            <View style={[freqStyles.typeDot, { backgroundColor: meta.color + "33", borderColor: meta.color }]}>
              <Text style={[freqStyles.typeDotText, { color: meta.color }]}>{meta.label}</Text>
            </View>
            <View style={freqStyles.info}>
              <Text style={[freqStyles.user, { color: colors.text }]} numberOfLines={1}>
                {item.nickname ?? item.userId.slice(0, 10)}
              </Text>
              <Text style={[freqStyles.sub, { color: colors.textSecondary }]} numberOfLines={1}>
                {[item.platform, item.appVersion ? `v${item.appVersion}` : null, item.deviceModel]
                  .filter(Boolean).join(" · ") || "—"}
              </Text>
              {item.window_sec > 0 && (
                <Text style={[freqStyles.window, { color: colors.textSecondary }]}>
                  finestra: {formatWindowSec(item.window_sec)}
                </Text>
              )}
            </View>
            <View style={[freqStyles.badge, { backgroundColor: meta.color + "22" }]}>
              <Text style={[freqStyles.badgeCount, { color: meta.color }]}>{item.occurrences}×</Text>
            </View>
          </View>
        );
      })}
      {items.length > 5 && (
        <TouchableOpacity style={freqStyles.expandBtn} onPress={() => setExpanded((v) => !v)}>
          <Text style={[freqStyles.expandBtnText, { color: colors.accent }]}>
            {expanded ? "Mostra meno" : `Mostra tutti (${items.length})`}
          </Text>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color={colors.accent} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const freqStyles = StyleSheet.create({
  container: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
    gap: 8,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 12, flex: 1 },
  countBadge: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  countBadgeText: { fontFamily: "Inter_700Bold", fontSize: 11 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: -4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ffffff15",
  },
  typeDot: {
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 70,
    alignItems: "center",
  },
  typeDotText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  info: { flex: 1, gap: 1 },
  user: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  sub: { fontFamily: "Inter_400Regular", fontSize: 11 },
  window: { fontFamily: "Inter_400Regular", fontSize: 10 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignItems: "center" },
  badgeCount: { fontFamily: "Inter_700Bold", fontSize: 14 },
  expandBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingTop: 6,
  },
  expandBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
});

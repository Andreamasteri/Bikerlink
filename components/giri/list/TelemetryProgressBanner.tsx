import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/query-client";

interface TelemetryStats {
  km_collected: number;
  progress_pct: number;
  target_km: number;
}

export function TelemetryProgressBanner() {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const { data: stats } = useQuery<TelemetryStats>({
    queryKey: ["/api/rides/me/telemetry-stats"],
    queryFn: () => apiRequest("GET", "/api/rides/me/telemetry-stats").then((r) => r.json()),
    staleTime: 60_000,
  });

  if (!stats) return null;

  const pct = stats.progress_pct;
  const kmLeft = Math.max(0, stats.target_km - stats.km_collected);
  const isDone = pct >= 100;

  return (
    <Pressable
      onPress={() => setExpanded((v) => !v)}
      style={[
        bannerStyles.chip,
        {
          backgroundColor: colors.surface,
          borderColor: isDone ? "#22c55e" : colors.accent + "55",
          marginHorizontal: 16,
          marginBottom: 10,
        },
      ]}
      testID="telemetry-banner"
    >
      <View style={bannerStyles.chipRow}>
        <MaterialCommunityIcons
          name={isDone ? "check-circle" : "chart-line"}
          size={15}
          color={isDone ? "#22c55e" : colors.accent}
        />
        <Text style={[bannerStyles.chipLabel, { color: isDone ? "#22c55e" : colors.text }]}>
          {isDone ? "Stile guida pronto" : `${pct}% — ${stats.km_collected.toFixed(0)} km raccolti`}
        </Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={13}
          color={colors.textSecondary}
        />
      </View>

      {expanded && (
        <View style={bannerStyles.panel}>
          <View style={[bannerStyles.barBg, { backgroundColor: colors.border }]}>
            <View
              style={[
                bannerStyles.barFill,
                {
                  width: `${Math.min(pct, 100)}%` as `${number}%`,
                  backgroundColor: isDone ? "#22c55e" : colors.accent,
                },
              ]}
            />
          </View>
          <Text style={[bannerStyles.detail, { color: colors.textSecondary }]}>
            {isDone
              ? "Dati sufficienti per pianificare percorsi basati sul tuo stile di guida reale."
              : `Quando raggiungerà il 100%, potrai pianificare percorsi in base al tuo stile di guida reale. Mancano ancora ${kmLeft.toFixed(0)} km (obiettivo: ${stats.target_km} km).`}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const bannerStyles = StyleSheet.create({
  chip: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  chipLabel: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  panel: {
    marginTop: 10,
    gap: 8,
  },
  barBg: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
  },
  detail: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
});

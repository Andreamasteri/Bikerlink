/**
 * Task #2527 — Telemetria matching.
 *
 * Mostra:
 *  - Raw output Prometheus da `/api/admin/matching/metrics`
 *  - Lista dei cicli recenti (da `/api/admin/matching/perf`)
 *  - Registry esposto da `/api/admin/matching/registry`
 */
import React from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

interface RegistryResponse {
  types: Array<{ id: number; key: string; label: string; category: string; prefColumn: string; addedBy: string }>;
  totalTypes: number;
  countableTypes: number;
}

export default function MatchingTelemetryScreen() {
  const insets = useSafeAreaInsets();

  const { data: registry, isLoading: regLoading } = useQuery<RegistryResponse>({
    queryKey: ["/api/admin/matching/registry"],
    staleTime: 60_000,
  });

  const { data: rawMetrics, isLoading: metricsLoading } = useQuery<string>({
    queryKey: ["/api/admin/matching/metrics-raw"],
    queryFn: async () => {
      const url = new URL("/api/admin/matching/metrics", getApiUrl()).toString();
      const res = await fetch(url, { credentials: "include" });
      return res.text();
    },
    refetchInterval: 15_000,
    staleTime: 5_000,
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Registry</Text>
        {regLoading && <ActivityIndicator color={Colors.accent} />}
        {registry && (
          <View style={styles.card}>
            <Text style={styles.bodyText}>
              {registry.totalTypes} tipi totali ({registry.countableTypes} con tabella SQL)
            </Text>
            {registry.types.map((t) => (
              <View key={t.key} style={styles.row}>
                <Text style={styles.rowKey}>#{t.id} {t.key}</Text>
                <Text style={styles.rowMeta}>{t.category} · {t.addedBy}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Metriche Prometheus (raw)</Text>
        {metricsLoading && <ActivityIndicator color={Colors.accent} />}
        {rawMetrics != null && (
          <View style={styles.card}>
            <Text style={styles.mono} selectable>
              {rawMetrics.length > 4000 ? rawMetrics.slice(0, 4000) + "\n…(truncato)" : rawMetrics}
            </Text>
          </View>
        )}
        <Text style={styles.helpText}>
          Endpoint: GET /api/admin/matching/metrics (richiede ruolo admin). Polling 15s.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  section: { marginHorizontal: 12, marginTop: 16 },
  sectionTitle: {
    fontFamily: "Inter_700Bold", fontSize: 13, color: Colors.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10,
  },
  card: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  bodyText: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text, marginBottom: 8 },
  row: {
    flexDirection: "row", justifyContent: "space-between", paddingVertical: 4,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  rowKey: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.text },
  rowMeta: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary },
  mono: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.text, lineHeight: 14 },
  helpText: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 8 },
});

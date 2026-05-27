import React from "react";
import { ScrollView, Text, View, StyleSheet, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";

interface ActiveRow { kind: string; value: unknown; source: string; user_count: number }
interface PendingRow { kind: string; value: unknown; user_count: number; avg_rejects: number }
interface Payload { active: ActiveRow[]; pendingSuggestions: PendingRow[] }

export default function NegativePrefPatternsScreen() {
  const colors = useColors();
  const { data, isLoading } = useQuery<Payload>({
    queryKey: ["/api/admin/matching/negative-pref-patterns"],
  });

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <Text style={[styles.h1, { color: colors.text }]}>Filtri esclusivi attivi (community)</Text>
      {(data?.active ?? []).length === 0 ? (
        <Text style={{ color: colors.textSecondary }}>Nessun filtro attivo.</Text>
      ) : (
        (data?.active ?? []).map((r, i) => (
          <View key={i} style={[styles.row, { borderColor: colors.border }]}>
            <Text style={[styles.kind, { color: colors.accent }]}>{r.kind}</Text>
            <Text style={{ color: colors.text }} numberOfLines={2}>{JSON.stringify(r.value)}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{r.source} · {r.user_count} utenti</Text>
          </View>
        ))
      )}

      <Text style={[styles.h1, { color: colors.text, marginTop: 24 }]}>Suggerimenti auto in attesa</Text>
      {(data?.pendingSuggestions ?? []).length === 0 ? (
        <Text style={{ color: colors.textSecondary }}>Nessun suggerimento pendente.</Text>
      ) : (
        (data?.pendingSuggestions ?? []).map((r, i) => (
          <View key={i} style={[styles.row, { borderColor: colors.border }]}>
            <Text style={[styles.kind, { color: colors.warning }]}>{r.kind}</Text>
            <Text style={{ color: colors.text }} numberOfLines={2}>{JSON.stringify(r.value)}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{r.user_count} utenti · media {r.avg_rejects} rifiuti</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, paddingBottom: 64 },
  h1: { fontSize: 18, fontWeight: "700" as const, marginBottom: 12 },
  row: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  kind: { fontSize: 12, fontWeight: "600" as const, textTransform: "uppercase" as const },
});

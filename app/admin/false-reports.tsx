/**
 * Task #2530 — Admin: pannello "False segnalazioni"
 * Mostra i reporter con ≥2 segnalazioni dismissed e il loro trust score.
 */
import React from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";

interface Row {
  reporterId: string;
  nickname: string | null;
  totalReports: number;
  dismissedCount: number;
  resolvedCount: number;
  trustScore: number;
}

export default function AdminFalseReports() {
  const insets = useSafeAreaInsets();

  const { data, isLoading } = useQuery<{ reporters: Row[]; total: number }>({
    queryKey: ["/api/admin/false-reports"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/false-reports");
      return res.json();
    },
  });

  function trustColor(score: number) {
    if (score < 0.5) return Colors.error;
    if (score < 0.9) return Colors.warning;
    return Colors.success;
  }

  function renderRow({ item }: { item: Row }) {
    return (
      <View style={styles.card}>
        <View style={{ flex: 1 }}>
          <Text style={styles.nickname}>{item.nickname ?? `Utente ${item.reporterId.slice(0, 8)}`}</Text>
          <Text style={styles.meta}>
            Tot: {item.totalReports} · Risolti: {item.resolvedCount} · Dismissed: {item.dismissedCount}
          </Text>
        </View>
        <View style={[styles.trustBadge, { backgroundColor: trustColor(item.trustScore) + "22", borderColor: trustColor(item.trustScore) }]}>
          <Text style={[styles.trustText, { color: trustColor(item.trustScore) }]}>
            trust {item.trustScore.toFixed(2)}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reporter a basso trust ({data?.total ?? 0})</Text>
        <Text style={styles.headerSubtitle}>
          Utenti con ≥2 segnalazioni archiviate. Trust score &lt; 0.5 = segnalazioni pesate al minimo nel sistema automatico.
        </Text>
      </View>
      <FlatList
        data={data?.reporters ?? []}
        keyExtractor={(item) => item.reporterId}
        renderItem={renderRow}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20, paddingHorizontal: 16 }}
        ListEmptyComponent={
          isLoading
            ? <ActivityIndicator style={{ marginTop: 40 }} color={Colors.accent} />
            : <Text style={styles.emptyText}>Nessun reporter abusivo rilevato</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { padding: 16, paddingBottom: 8 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: Colors.text, marginBottom: 4 },
  headerSubtitle: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 16 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  nickname: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text },
  meta: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  trustBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  trustText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
});

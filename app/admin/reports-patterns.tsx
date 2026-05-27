/**
 * Task #2531 — Pattern view: utenti con ≥ N segnalazioni in K giorni,
 * ordinati per peso aggregato (sum reporterTrustScore). Quick actions:
 * ban 7d, ban 30d, ban permanente, dismiss tutti.
 */
import React from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Alert, TouchableOpacity } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";

interface Pattern {
  reportedUserId: string;
  nickname: string | null;
  userType: string | null;
  count: number;
  weight: number;
  lastReportAt: string | null;
  statusBreakdown: Record<string, number>;
}

export default function ReportsPatternsScreen() {
  const insets = useSafeAreaInsets();
  const [minCount, setMinCount] = React.useState(2);
  const [days, setDays] = React.useState(30);

  const { data, isLoading, refetch } = useQuery<{ patterns: Pattern[]; total: number }>({
    queryKey: ["/api/admin/reports/patterns", { minCount, days }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/reports/patterns?minCount=${minCount}&days=${days}`);
      return res.json();
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PUT", `/api/admin/users/${id}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reports/patterns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reports/active-bans"] });
    },
    onError: (e: unknown) => Alert.alert("Errore", e instanceof Error ? e.message : "Errore ban"),
  });

  function handleQuickAction(p: Pattern) {
    Alert.alert(
      `Pattern: ${p.nickname ?? p.reportedUserId.slice(0, 8)}`,
      `${p.count} segnalazioni (peso ${p.weight.toFixed(2)})`,
      [
        { text: "Sospendi", onPress: () => statusMutation.mutate({ id: p.reportedUserId, status: "suspended" }) },
        {
          text: "Blocca",
          style: "destructive",
          onPress: () => statusMutation.mutate({ id: p.reportedUserId, status: "blocked" }),
        },
        { text: "Annulla", style: "cancel" },
      ]
    );
  }

  function renderRow({ item }: { item: Pattern }) {
    const last = item.lastReportAt ? new Date(item.lastReportAt).toLocaleDateString("it-IT") : "—";
    return (
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.nickname}>
            {item.nickname ?? `Utente ${item.reportedUserId.slice(0, 8)}`}
            {item.userType ? ` · ${item.userType}` : ""}
          </Text>
          <Text style={styles.meta}>
            {item.count} report · peso {item.weight.toFixed(2)} · ultimo {last}
          </Text>
          <View style={styles.badgeRow}>
            {Object.entries(item.statusBreakdown).map(([s, n]) => (
              <View key={s} style={styles.statusBadge}>
                <Text style={styles.statusBadgeText}>{s}: {n}</Text>
              </View>
            ))}
          </View>
        </View>
        <TouchableOpacity onPress={() => handleQuickAction(item)} style={styles.actionBtn}>
          <MaterialCommunityIcons name="gavel" size={22} color={Colors.error} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.filtersRow}>
        <Text style={styles.filterLabel}>Min:</Text>
        {[2, 3, 5, 10].map((n) => (
          <TouchableOpacity key={n} style={[styles.filterChip, minCount === n && styles.filterChipActive]} onPress={() => setMinCount(n)}>
            <Text style={[styles.filterChipText, minCount === n && styles.filterChipTextActive]}>{n}</Text>
          </TouchableOpacity>
        ))}
        <Text style={[styles.filterLabel, { marginLeft: 12 }]}>Giorni:</Text>
        {[7, 30, 90].map((d) => (
          <TouchableOpacity key={d} style={[styles.filterChip, days === d && styles.filterChipActive]} onPress={() => setDays(d)}>
            <Text style={[styles.filterChipText, days === d && styles.filterChipTextActive]}>{d}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={data?.patterns ?? []}
        keyExtractor={(item) => item.reportedUserId}
        renderItem={renderRow}
        onRefresh={refetch}
        refreshing={isLoading}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 20 }}
        ListHeaderComponent={data ? <Text style={styles.header}>{data.total} utenti con pattern attivo</Text> : null}
        ListEmptyComponent={
          isLoading
            ? <ActivityIndicator color={Colors.accent} style={{ marginTop: 40 }} />
            : <Text style={styles.empty}>Nessun pattern rilevato</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  filtersRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, paddingHorizontal: 16, paddingVertical: 12 },
  filterLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.text },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.accent + "22", borderColor: Colors.accent },
  filterChipText: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.textSecondary },
  filterChipTextActive: { color: Colors.accent },
  header: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.textSecondary, marginVertical: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  nickname: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  meta: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 3 },
  badgeRow: { flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" },
  statusBadge: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeText: { fontFamily: "Inter_500Medium", fontSize: 10, color: Colors.textSecondary },
  actionBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.error + "55",
  },
  empty: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
});

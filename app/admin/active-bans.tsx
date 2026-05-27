/**
 * Task #2531 — Lista ban attivi (shadow-ban, suspended, blocked).
 * Mostra countdown per shadow-ban temporanei e bottone "sblocca".
 */
import React from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, Alert } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";

interface Ban {
  userId: string;
  nickname: string;
  userType: string | null;
  type: "shadow" | "suspended" | "blocked";
  reason: string | null;
  shadowBannedAt: string | null;
  shadowBannedUntil: string | null;
  updatedAt: string | null;
}

const TYPE_COLOR: Record<Ban["type"], string> = {
  shadow: "#9C27B0",
  suspended: "#FF9500",
  blocked: "#FF3B30",
};

function countdown(until: string | null): string {
  if (!until) return "—";
  const ms = new Date(until).getTime() - Date.now();
  if (ms <= 0) return "scaduto";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}g ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function ActiveBansScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = React.useState<"all" | Ban["type"]>("all");
  const { data, isLoading, refetch } = useQuery<{ bans: Ban[]; total: number }>({
    queryKey: ["/api/admin/reports/active-bans"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/reports/active-bans");
      return res.json();
    },
  });

  const unbanMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await apiRequest("POST", `/api/admin/reports/users/${id}/unban`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reports/active-bans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (e: unknown) => Alert.alert("Errore", e instanceof Error ? e.message : "Errore sblocco"),
  });

  function confirmUnban(b: Ban) {
    Alert.alert(
      "Sblocca utente",
      `Vuoi rimuovere il ban di ${b.nickname}?`,
      [
        { text: "Annulla", style: "cancel" },
        { text: "Sblocca", style: "destructive", onPress: () => unbanMutation.mutate({ id: b.userId }) },
      ]
    );
  }

  const filtered = (data?.bans ?? []).filter((b) => filter === "all" || b.type === filter);

  function renderRow({ item }: { item: Ban }) {
    const color = TYPE_COLOR[item.type];
    return (
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.nickname}>{item.nickname}{item.userType ? ` · ${item.userType}` : ""}</Text>
          <View style={styles.metaRow}>
            <View style={[styles.typeBadge, { backgroundColor: color + "22", borderColor: color }]}>
              <Text style={[styles.typeBadgeText, { color }]}>{item.type}</Text>
            </View>
            {item.shadowBannedUntil && (
              <Text style={styles.countdown}>scade in {countdown(item.shadowBannedUntil)}</Text>
            )}
          </View>
          {item.reason && <Text style={styles.reason} numberOfLines={2}>{item.reason}</Text>}
        </View>
        <TouchableOpacity onPress={() => confirmUnban(item)} style={styles.unbanBtn}>
          <MaterialCommunityIcons name="lock-open-variant-outline" size={20} color={Colors.success} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.filters}>
        {(["all", "shadow", "suspended", "blocked"] as const).map((f) => (
          <TouchableOpacity key={f} style={[styles.filterChip, filter === f && styles.filterChipActive]} onPress={() => setFilter(f)}>
            <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.userId}
        renderItem={renderRow}
        onRefresh={refetch}
        refreshing={isLoading}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 20 }}
        ListHeaderComponent={
          data ? <Text style={styles.header}>{filtered.length} / {data.total} ban attivi</Text> : null
        }
        ListEmptyComponent={
          isLoading
            ? <ActivityIndicator color={Colors.accent} style={{ marginTop: 40 }} />
            : <Text style={styles.empty}>Nessun ban attivo</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  filters: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.accent + "22", borderColor: Colors.accent },
  filterChipText: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.textSecondary, textTransform: "uppercase" },
  filterChipTextActive: { color: Colors.accent },
  header: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.textSecondary, marginVertical: 8 },
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
  dot: { width: 8, height: 8, borderRadius: 4 },
  nickname: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  typeBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 10, textTransform: "uppercase" },
  countdown: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary },
  reason: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 4, fontStyle: "italic" },
  unbanBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.success + "55",
  },
  empty: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
});

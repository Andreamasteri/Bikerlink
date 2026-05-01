import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/query-client";

interface Report {
  id: string;
  reporterId: string;
  reportedUserId: string;
  reason: string;
  description: string | null;
  status: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

type FilterStatus = "all" | "pending" | "resolved" | "dismissed";

export default function AdminReports() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<FilterStatus>("pending");

  const queryKey = filter === "all" ? ["/api/admin/reports"] : ["/api/admin/reports", `?status=${filter}`];

  const { data: reports = [], isLoading } = useQuery<Report[]>({
    queryKey: ["/api/admin/reports"],
    queryFn: async () => {
      const url = filter === "all" ? "/api/admin/reports" : `/api/admin/reports?status=${filter}`;
      const res = await apiRequest("GET", url);
      return res.json();
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PUT", `/api/admin/reports/${id}/resolve`, { status });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/reports"] }),
  });

  function handleResolve(report: Report) {
    Alert.alert(t("admin.manageReport"), report.reason, [
      { text: t("admin.resolve"), onPress: () => resolveMutation.mutate({ id: report.id, status: "resolved" }) },
      { text: t("admin.archive"), onPress: () => resolveMutation.mutate({ id: report.id, status: "dismissed" }) },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }

  function getStatusColor(status: string) {
    switch (status) {
      case "pending": return Colors.warning;
      case "resolved": return Colors.success;
      case "dismissed": return Colors.textSecondary;
      default: return Colors.textSecondary;
    }
  }

  function renderReport({ item }: { item: Report }) {
    return (
      <View style={styles.card}>
        <View style={styles.info}>
          <Text style={styles.reason}>{item.reason}</Text>
          {item.description && <Text style={styles.description} numberOfLines={2}>{item.description}</Text>}
          <Text style={styles.meta}>
            Da: {item.reporterId.slice(0, 8)}... | Vs: {item.reportedUserId.slice(0, 8)}...
          </Text>
          <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString("it-IT")}</Text>
          <View style={[styles.badge, { backgroundColor: getStatusColor(item.status) + "33" }]}>
            <Text style={[styles.badgeText, { color: getStatusColor(item.status) }]}>{item.status}</Text>
          </View>
        </View>
        {item.status === "pending" && (
          <TouchableOpacity onPress={() => handleResolve(item)}>
            <MaterialIcons name="gavel" size={24} color={Colors.accent} />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const filters: FilterStatus[] = ["pending", "resolved", "dismissed", "all"];

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === "all" ? t("admin.filterAll") : f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={reports}
        keyExtractor={(item) => item.id}
        renderItem={renderReport}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20, paddingHorizontal: 16 }}
        ListEmptyComponent={
          isLoading ? <Text style={styles.emptyText}>Caricamento...</Text> : <Text style={styles.emptyText}>Nessuna segnalazione</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  filterRow: { flexDirection: "row", gap: 8, padding: 16, paddingBottom: 8 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  filterBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + "22" },
  filterText: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.textSecondary },
  filterTextActive: { color: Colors.accent },
  card: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12,
    flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: Colors.border,
  },
  info: { flex: 1 },
  reason: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },
  description: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
  meta: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 6 },
  date: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: "flex-start", marginTop: 6 },
  badgeText: { fontFamily: "Inter_500Medium", fontSize: 11 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
});

/**
 * Task #2530 — Admin Reports con filtri status/category/severity/context e
 * masking automatico del reporter (lato server). I moderatori vedono
 * `anon_XXXXX` al posto dell'ID reporter; gli admin vedono l'ID completo.
 */
import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ScrollView } from "react-native";
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
  category?: string | null;
  context?: string | null;
  severity?: string | null;
  affectedFeedbackLoop?: boolean;
  reporterTrustScore?: number;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  _reporterMasked?: boolean;
}

type FilterStatus = "all" | "pending" | "resolved" | "dismissed";
type FilterSeverity = "all" | "low" | "medium" | "high" | "critical";
type FilterCategory =
  | "all" | "aggressive" | "harassment" | "fake_profile" | "no_show"
  | "opportunist" | "group_misconduct" | "dangerous_riding" | "other";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#FF3B30",
  high: "#FF9500",
  medium: "#FFCC00",
  low: "#8E8E93",
};

export default function AdminReports() {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<FilterStatus>("pending");
  const [severity, setSeverity] = useState<FilterSeverity>("all");
  const [category, setCategory] = useState<FilterCategory>("all");

  const { data: reports = [], isLoading } = useQuery<Report[]>({
    queryKey: ["/api/admin/reports", { status, severity, category }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status !== "all") params.set("status", status);
      if (severity !== "all") params.set("severity", severity);
      if (category !== "all") params.set("category", category);
      const qs = params.toString();
      const res = await apiRequest("GET", `/api/admin/reports${qs ? `?${qs}` : ""}`);
      return res.json();
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: string }) => {
      const res = await apiRequest("PUT", `/api/admin/reports/${id}/resolve`, { status: newStatus });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/reports"] }),
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Errore risoluzione";
      Alert.alert("Errore", msg);
    },
  });

  function handleResolve(report: Report) {
    Alert.alert(t("admin.manageReport"), `${report.category ?? report.reason}`, [
      { text: t("admin.resolve"), onPress: () => resolveMutation.mutate({ id: report.id, newStatus: "resolved" }) },
      { text: t("admin.archive"), onPress: () => resolveMutation.mutate({ id: report.id, newStatus: "dismissed" }) },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }

  function getStatusColor(s: string) {
    switch (s) {
      case "pending": return Colors.warning;
      case "resolved": return Colors.success;
      case "dismissed": return Colors.textSecondary;
      default: return Colors.textSecondary;
    }
  }

  function renderReport({ item }: { item: Report }) {
    const sevColor = item.severity ? SEVERITY_COLORS[item.severity] ?? Colors.textSecondary : Colors.textSecondary;
    return (
      <View style={styles.card}>
        <View style={styles.info}>
          <View style={styles.row}>
            {item.severity && (
              <View style={[styles.sevBadge, { backgroundColor: sevColor + "22", borderColor: sevColor }]}>
                <Text style={[styles.sevText, { color: sevColor }]}>{item.severity}</Text>
              </View>
            )}
            <Text style={styles.reason} numberOfLines={1}>{item.category ?? item.reason}</Text>
          </View>
          {item.description && <Text style={styles.description} numberOfLines={2}>{item.description}</Text>}
          <Text style={styles.meta}>
            Da: {item._reporterMasked ? item.reporterId : item.reporterId.slice(0, 8) + "..."}
            {item.reporterTrustScore != null ? ` (trust ${item.reporterTrustScore.toFixed(2)})` : ""}
            {"  ·  "}Vs: {item.reportedUserId.slice(0, 8)}...
          </Text>
          <Text style={styles.meta}>
            Ctx: {item.context ?? "—"} {item.affectedFeedbackLoop ? "· hook→matching" : ""}
          </Text>
          <Text style={styles.date}>{new Date(item.createdAt).toLocaleString("it-IT")}</Text>
          <View style={[styles.badge, { backgroundColor: getStatusColor(item.status) + "33" }]}>
            <Text style={[styles.badgeText, { color: getStatusColor(item.status) }]}>{item.status}</Text>
          </View>
        </View>
        {item.status === "pending" && (
          <TouchableOpacity onPress={() => handleResolve(item)} testID={`resolve-${item.id}`}>
            <MaterialIcons name="gavel" size={24} color={Colors.accent} />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const statusFilters: FilterStatus[] = ["pending", "resolved", "dismissed", "all"];
  const sevFilters: FilterSeverity[] = ["all", "critical", "high", "medium", "low"];
  const catFilters: FilterCategory[] = ["all", "aggressive", "harassment", "fake_profile", "no_show", "opportunist", "group_misconduct", "dangerous_riding", "other"];

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {statusFilters.map((f) => (
          <TouchableOpacity key={f} style={[styles.filterBtn, status === f && styles.filterBtnActive]} onPress={() => setStatus(f)}>
            <Text style={[styles.filterText, status === f && styles.filterTextActive]}>
              {f === "all" ? t("admin.filterAll") : f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRowSmall}>
        {sevFilters.map((f) => (
          <TouchableOpacity key={f} style={[styles.filterBtnSm, severity === f && styles.filterBtnActive]} onPress={() => setSeverity(f)}>
            <Text style={[styles.filterTextSm, severity === f && styles.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRowSmall}>
        {catFilters.map((f) => (
          <TouchableOpacity key={f} style={[styles.filterBtnSm, category === f && styles.filterBtnActive]} onPress={() => setCategory(f)}>
            <Text style={[styles.filterTextSm, category === f && styles.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={reports}
        keyExtractor={(item) => item.id}
        renderItem={renderReport}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20, paddingHorizontal: 16, paddingTop: 8 }}
        ListEmptyComponent={
          isLoading ? <Text style={styles.emptyText}>Caricamento...</Text> : <Text style={styles.emptyText}>Nessuna segnalazione</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  filterRowSmall: { flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingVertical: 4 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  filterBtnSm: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  filterBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + "22" },
  filterText: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.textSecondary },
  filterTextSm: { fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.textSecondary },
  filterTextActive: { color: Colors.accent },
  card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: Colors.border },
  info: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  reason: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text, flexShrink: 1 },
  sevBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  sevText: { fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase" },
  description: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
  meta: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 4 },
  date: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: "flex-start", marginTop: 6 },
  badgeText: { fontFamily: "Inter_500Medium", fontSize: 11 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
});

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/query-client";

import {
  CrashLogRow,
  CrashLogsResponse,
  CrashStatsResponse,
  CrashType,
} from "@/components/admin/crash-logs/CrashLogTypes";
import { CrashLogCard } from "@/components/admin/crash-logs/CrashLogCard";
import { CrashLogFilters } from "@/components/admin/crash-logs/CrashLogFilters";
import { CrashStackTrace } from "@/components/admin/crash-logs/CrashStackTrace";
import { CrashLogStats } from "@/components/admin/crash-logs/CrashLogStats";

const LIMIT = 20;

export default function CrashLogsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [filterType, setFilterType] = useState<"" | CrashType>("");
  const [filterUser, setFilterUser] = useState("");
  const [filterVersion, setFilterVersion] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCrash, setSelectedCrash] = useState<CrashLogRow | null>(null);

  function buildQueryString() {
    const p = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (filterType) p.set("crashType", filterType);
    if (filterUser.trim()) p.set("userId", filterUser.trim());
    if (filterVersion.trim()) p.set("appVersion", filterVersion.trim());
    if (filterDateFrom.trim()) p.set("dateFrom", filterDateFrom.trim());
    if (filterDateTo.trim()) p.set("dateTo", filterDateTo.trim());
    return p.toString();
  }

  const { data, isLoading, isError, refetch } = useQuery<CrashLogsResponse>({
    queryKey: ["/api/admin/crash-logs", filterType, filterUser, filterVersion, filterDateFrom, filterDateTo, page],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/crash-logs?${buildQueryString()}`);
      return res.json() as Promise<CrashLogsResponse>;
    },
    staleTime: 30_000,
  });

  const { data: statsData } = useQuery<CrashStatsResponse>({
    queryKey: ["/api/admin/crash-logs/stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/crash-logs/stats");
      return res.json() as Promise<CrashStatsResponse>;
    },
    staleTime: 60_000,
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  function resetFilters() {
    setFilterUser("");
    setFilterVersion("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterType("");
    setPage(1);
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <CrashStackTrace
        visible={!!selectedCrash}
        item={selectedCrash}
        onClose={() => setSelectedCrash(null)}
      />

      <CrashLogFilters
        filterType={filterType}
        setFilterType={setFilterType}
        filterUser={filterUser}
        setFilterUser={setFilterUser}
        filterVersion={filterVersion}
        setFilterVersion={setFilterVersion}
        filterDateFrom={filterDateFrom}
        setFilterDateFrom={setFilterDateFrom}
        filterDateTo={filterDateTo}
        setFilterDateTo={setFilterDateTo}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        resetFilters={resetFilters}
        setPage={setPage}
      />

      {isLoading && !data ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : isError && !data ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="alert-circle-outline" size={40} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Errore caricamento dati</Text>
          <TouchableOpacity onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: colors.accent }]}>
            <Text style={styles.retryBtnText}>Riprova</Text>
          </TouchableOpacity>
        </View>
      ) : logs.length === 0 ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="check-circle-outline" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Nessun crash registrato</Text>
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <CrashLogCard item={item} onOpenStack={setSelectedCrash} />
          )}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 20 }]}
          ListHeaderComponent={
            <View>
              {statsData && <CrashLogStats stats={statsData} />}
              <Text style={[styles.totalText, { color: colors.textSecondary, marginTop: statsData ? 12 : 4 }]}>
                {total} crash
                {filterType ? ` · ${filterType === "crash_js" ? "JS Error" : "Sistema"}` : ""}
                {filterVersion.trim() ? ` · v${filterVersion.trim()}` : ""}
              </Text>
              {data?.deviceStats && data.deviceStats.length > 0 && (
                <View style={[styles.deviceStatsContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.deviceStatsTitle, { color: colors.textSecondary }]}>
                    Top dispositivi
                  </Text>
                  {data.deviceStats.map((stat, i) => {
                    const label = [stat.platform, stat.deviceModel].filter(Boolean).join(" · ") || "Sconosciuto";
                    return (
                      <View key={i} style={styles.deviceStatRow}>
                        <Text style={[styles.deviceStatLabel, { color: colors.text }]} numberOfLines={1}>
                          {label}
                        </Text>
                        <View style={[styles.deviceStatBadge, { backgroundColor: "#FF6B3522" }]}>
                          <Text style={[styles.deviceStatCount, { color: "#FF6B35" }]}>{stat.total}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          }
          ListFooterComponent={
            totalPages > 1 ? (
              <View style={styles.pagination}>
                <TouchableOpacity
                  style={[styles.pageBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: page <= 1 ? 0.4 : 1 }]}
                  onPress={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <Ionicons name="chevron-back" size={16} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.pageText, { color: colors.textSecondary }]}>
                  {page} / {totalPages}
                </Text>
                <TouchableOpacity
                  style={[styles.pageBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: page >= totalPages ? 0.4 : 1 }]}
                  onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  <Ionicons name="chevron-forward" size={16} color={colors.text} />
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 15, textAlign: "center" },
  retryBtn: { borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  retryBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  list: { paddingHorizontal: 16, paddingTop: 8 },
  totalText: { fontFamily: "Inter_400Regular", fontSize: 13, marginBottom: 12, marginTop: 4 },
  pagination: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, paddingTop: 16 },
  pageBtn: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  pageText: { fontFamily: "Inter_500Medium", fontSize: 14 },
  deviceStatsContainer: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  deviceStatsTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  deviceStatRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  deviceStatLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    flex: 1,
  },
  deviceStatBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  deviceStatCount: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
});
